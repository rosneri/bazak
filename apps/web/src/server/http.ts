import { ZodError } from "zod";
import { RepositoryError, type RepositoryCode } from "@bazak/conversation/application/repository";
import {
  createConversationInputSchema,
  sendTurnInputSchema,
  retryTurnInputSchema,
  idSchema,
  turnEventSchema,
  type TurnEvent,
} from "@bazak/conversation/domain/turn";
import type { ShopperServices } from "./services.ts";

const failures = {
  invalid_input: [400, "Check the request and try again."],
  not_found: [404, "This chat or turn could not be found."],
  thread_busy: [409, "Another reply is in progress. Your draft is ready to send once it finishes."],
  turn_conflict: [409, "This message ID already belongs to another message."],
  attempt_conflict: [409, "This attempt changed. Reload the chat to see its status."],
  corrupt_thread: [500, "This chat could not be read. You can still open other chats."],
  storage_unavailable: [503, "Chat storage is unavailable. Reconnect and try again."],
} satisfies Record<RepositoryCode, [number, string]>;

async function handle(action: () => Promise<Response>) {
  try {
    return await action();
  } catch (cause) {
    const code =
      cause instanceof RepositoryError
        ? cause.code
        : cause instanceof ZodError || cause instanceof SyntaxError
          ? "invalid_input"
          : "storage_unavailable";

    const [status, message] = failures[code];

    return Response.json(
      { error: { code, message } },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

function stream(events: AsyncIterable<TurnEvent>, turnId: string) {
  const iterator = events[Symbol.asyncIterator]();
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();

        if (next.done) {
          controller.close();

          return;
        }

        controller.enqueue(
          encoder.encode("data: " + JSON.stringify(turnEventSchema.parse(next.value)) + "\n\n"),
        );
      } catch {
        const error: TurnEvent = {
          type: "error",
          turnId,
          code: "stream_interrupted",
          message: "This reply was interrupted. Reload to check its saved status.",
        };

        controller.enqueue(encoder.encode("data: " + JSON.stringify(error) + "\n\n"));
        controller.close();
        await iterator.return?.();
      }
    },
    async cancel() {
      await iterator.return?.();
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

export function conversationHandlers({ management, chat }: ShopperServices) {
  return {
    list: () =>
      handle(async () =>
        Response.json(
          { conversations: await management.list() },
          { headers: { "Cache-Control": "no-store" } },
        ),
      ),
    create: (request: Request) =>
      handle(async () => {
        const { id } = createConversationInputSchema.parse(await request.json());
        const { created, conversation } = await management.create(id);

        return Response.json({ conversation }, { status: created ? 201 : 200 });
      }),
    load: (id: string) =>
      handle(async () =>
        Response.json(await management.load(idSchema.parse(id)), {
          headers: { "Cache-Control": "no-store" },
        }),
      ),
    send: (id: string, request: Request) =>
      handle(async () => {
        const conversationId = idSchema.parse(id);
        const input = sendTurnInputSchema.parse(await request.json());

        return stream(await chat.send(conversationId, input, request.signal), input.turnId);
      }),
    retry: (id: string, turnId: string, request: Request) =>
      handle(async () => {
        const conversationId = idSchema.parse(id);
        idSchema.parse(turnId);
        const { expectedAttempt } = retryTurnInputSchema.parse(await request.json());

        return stream(
          await chat.retry(conversationId, turnId, expectedAttempt, request.signal),
          turnId,
        );
      }),
  };
}
