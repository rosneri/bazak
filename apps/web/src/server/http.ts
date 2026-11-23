import type { ZodSafeParseResult, ZodType } from "zod";
import type { ConversationEvent, TurnErrorCode } from "@bazak/conversation/application/chat";
import { RepositoryError, type RepositoryCode } from "@bazak/conversation/application/repository";
import {
  turnEventSchema,
  type TurnEvent as DomainTurnEvent,
} from "@bazak/conversation/domain/turn";
import {
  ApiErrorResponse,
  ConversationListResponse,
  ConversationResponse,
  CreateConversationInput,
  Identifier,
  RetryTurnInput,
  SavedConversation,
  SendTurnInput,
  TurnEvent,
} from "../api/generated/models.ts";
import type { ConversationTransportLogger, ConversationTransportOperation } from "./logger.ts";
import type { ShopperServices } from "./services.ts";

const httpFailures = {
  invalid_input: [400, "Check the request and try again."],
  not_found: [404, "This chat or turn could not be found."],
  thread_busy: [409, "Another reply is in progress. Your draft is ready to send once it finishes."],
  turn_conflict: [409, "This message ID already belongs to another message."],
  attempt_conflict: [409, "This attempt changed. Reload the chat to see its status."],
  corrupt_thread: [500, "This chat could not be read. You can still open other chats."],
  storage_unavailable: [503, "Chat storage is unavailable. Reconnect and try again."],
} satisfies Record<RepositoryCode, [number, string]>;

type StreamFailureCode = TurnErrorCode | "stream_interrupted";

const repositoryFailureMessage =
  "This reply could not be saved. Reload the conversation to check its status.";

const streamFailures = {
  invalid_input: repositoryFailureMessage,
  not_found: repositoryFailureMessage,
  thread_busy: repositoryFailureMessage,
  turn_conflict: repositoryFailureMessage,
  attempt_conflict: repositoryFailureMessage,
  corrupt_thread: repositoryFailureMessage,
  storage_unavailable: repositoryFailureMessage,
  provider_configuration: "Set OPENAI_API_KEY in the server environment, then retry this turn.",
  attempt_failed: "The reply was interrupted. Check the conversation and retry this turn.",
  stream_interrupted: "This reply was interrupted. Reload to check its saved status.",
} satisfies Record<StreamFailureCode, string>;

class InvalidRequestError extends Error {}

function parseInput<T>(result: ZodSafeParseResult<T>): T {
  if (!result.success) throw new InvalidRequestError();

  return result.data;
}

async function parseBody<T>(schema: ZodType<T>, request: Request): Promise<T> {
  let body: unknown;

  try {
    body = await request.json();
  } catch (cause) {
    if (cause instanceof SyntaxError) throw new InvalidRequestError();
    throw cause;
  }

  return parseInput(schema.safeParse(body));
}

function repositoryCode(cause: unknown): RepositoryCode | undefined {
  if (cause instanceof RepositoryError && Object.hasOwn(httpFailures, cause.code))
    return cause.code;

  return undefined;
}

function toHttpFailure(cause: unknown): RepositoryCode {
  if (cause instanceof InvalidRequestError) return "invalid_input";

  return repositoryCode(cause) ?? "storage_unavailable";
}

function wasAborted(cause: unknown, signal?: AbortSignal) {
  return (
    signal?.aborted &&
    (cause === signal.reason || (cause instanceof Error && cause.name === "AbortError"))
  );
}

interface ControllerDependencies {
  getServices: () => ShopperServices | Promise<ShopperServices>;
  logger: ConversationTransportLogger;
}

type ConversationPath = { id: string };

type RetryPath = ConversationPath & { turnId: string };

export function createConversationController({ getServices, logger }: ControllerDependencies) {
  async function respond(
    operation: ConversationTransportOperation,
    action: () => Promise<Response>,
    signal?: AbortSignal,
  ) {
    try {
      return await action();
    } catch (cause) {
      const code = toHttpFailure(cause);
      const [status, message] = httpFailures[code];

      if (status >= 500 && !wasAborted(cause, signal))
        logger.error({ operation, phase: "http", code, status });

      return Response.json(ApiErrorResponse.parse({ error: { code, message } }), {
        status,
        headers: { "Cache-Control": "no-store" },
      });
    }
  }

  async function stream(
    operation: "send" | "retry",
    turnId: string,
    request: Request,
    acquire: (signal: AbortSignal) => Promise<AsyncIterable<ConversationEvent>>,
  ) {
    const readerCancellation = new AbortController();
    const signal = AbortSignal.any([request.signal, readerCancellation.signal]);
    const events = await acquire(signal);
    const iterator = events[Symbol.asyncIterator]();
    const encoder = new TextEncoder();
    let open = true;
    let onAbort: () => void;
    let cleanup: Promise<void> | undefined;

    function frame(event: DomainTurnEvent) {
      const payload = TurnEvent.parse(turnEventSchema.parse(event));

      return encoder.encode("data: " + JSON.stringify(payload) + "\n\n");
    }

    function stop() {
      open = false;
      signal.removeEventListener("abort", onAbort);
    }

    function release(reportFailure: boolean) {
      if (!open) return cleanup;
      stop();

      cleanup = Promise.resolve().then(async () => {
        readerCancellation.abort();

        try {
          await iterator.return?.();
        } catch (cause) {
          if (reportFailure)
            logger.error({
              operation,
              phase: "cleanup",
              code: repositoryCode(cause) ?? "stream_interrupted",
            });
        }
      });

      return cleanup;
    }

    // Start the attempt before an immediate cancellation can return its generator.
    async function start() {
      return iterator.next();
    }

    let first: Promise<IteratorResult<ConversationEvent>> | undefined = start();

    // An already-aborted request can close the body before its first pull.
    void first.catch(() => {});

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        onAbort = () => {
          controller.close();
          void release(true);
        };

        signal.addEventListener("abort", onAbort, { once: true });

        if (signal.aborted) onAbort();
      },
      async pull(controller) {
        function fail(code: StreamFailureCode) {
          controller.enqueue(frame({ type: "error", turnId, code, message: streamFailures[code] }));
          controller.close();
          const settled = release(false);
          logger.error({ operation, phase: "stream", code });

          return settled;
        }

        try {
          const next = await (first ?? iterator.next());
          first = undefined;

          if (!open) return;

          if (next.done) {
            stop();
            controller.close();

            return;
          }

          if (next.value.type === "error") {
            const { code } = next.value;
            await fail(Object.hasOwn(streamFailures, code) ? code : "stream_interrupted");

            return;
          }

          controller.enqueue(frame(next.value));
        } catch (cause) {
          if (open) await fail(repositoryCode(cause) ?? "stream_interrupted");
        }
      },
      cancel() {
        return release(true);
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  }

  return {
    list: () =>
      respond("list", async () => {
        const { management } = await getServices();

        return Response.json(
          ConversationListResponse.parse({ conversations: await management.list() }),
          { headers: { "Cache-Control": "no-store" } },
        );
      }),
    create: (request: Request) =>
      respond(
        "create",
        async () => {
          const { id } = await parseBody(CreateConversationInput, request);
          // Reject malformed requests before initializing services.
          // react-doctor-disable-next-line react-doctor/server-sequential-independent-await
          const { management } = await getServices();
          const { created, conversation } = await management.create(id);

          return Response.json(ConversationResponse.parse({ conversation }), {
            status: created ? 201 : 200,
          });
        },
        request.signal,
      ),
    load: (params: ConversationPath | Promise<ConversationPath>) =>
      respond("load", async () => {
        const id = parseInput(Identifier.safeParse((await params).id));
        const { management } = await getServices();

        return Response.json(SavedConversation.parse(await management.load(id)), {
          headers: { "Cache-Control": "no-store" },
        });
      }),
    send: (request: Request, params: ConversationPath | Promise<ConversationPath>) =>
      respond(
        "send",
        async () => {
          const id = parseInput(Identifier.safeParse((await params).id));
          const input = await parseBody(SendTurnInput, request);
          // Reject malformed requests before initializing services.
          // react-doctor-disable-next-line react-doctor/server-sequential-independent-await
          const { chat } = await getServices();

          return stream("send", input.turnId, request, (signal) => chat.send(id, input, signal));
        },
        request.signal,
      ),
    retry: (request: Request, params: RetryPath | Promise<RetryPath>) =>
      respond(
        "retry",
        async () => {
          const path = await params;
          const id = parseInput(Identifier.safeParse(path.id));
          const turnId = parseInput(Identifier.safeParse(path.turnId));
          const { expectedAttempt } = await parseBody(RetryTurnInput, request);
          // Reject malformed requests before initializing services.
          // react-doctor-disable-next-line react-doctor/server-sequential-independent-await
          const { chat } = await getServices();

          return stream("retry", turnId, request, (signal) =>
            chat.retry(id, turnId, expectedAttempt, signal),
          );
        },
        request.signal,
      ),
  };
}
