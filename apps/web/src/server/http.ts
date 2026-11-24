import type { ZodSafeParseResult, ZodType } from "zod";
import { getLoopbackOrigin } from "@bazak/shared/loopback-origin";
import {
  type ApiErrorCode,
  ApiErrorResponse,
  ConversationListResponse,
  ConversationResponse,
  CreateConversationInput,
  Identifier,
  RetryTurnInput,
  SavedConversation,
  SendTurnInput,
} from "../api/generated/models.ts";
import type { ConversationTransportLogger, ConversationTransportOperation } from "./logger.ts";
import type { ShopperServices } from "./services.ts";
import { readJsonBody, RequestError, verifyWriteOrigin } from "./write-request.ts";
import { httpFailures, repositoryCode } from "./http-failures.ts";
import { streamTurn } from "./turn-stream-response.ts";

function parseInput<T>(result: ZodSafeParseResult<T>): T {
  if (!result.success) throw new RequestError("invalid_input");

  return result.data;
}

async function parseBody<T>(schema: ZodType<T>, request: Request): Promise<T> {
  const text = await readJsonBody(request);
  let body: unknown;

  try {
    body = JSON.parse(text);
  } catch (cause) {
    if (cause instanceof SyntaxError) throw new RequestError("invalid_input");
    throw cause;
  }

  return parseInput(schema.safeParse(body));
}

function toHttpFailure(cause: unknown): ApiErrorCode {
  if (cause instanceof RequestError) return cause.code;

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
  port: string;
}

type ConversationPath = { id: string };

type RetryPath = ConversationPath & { turnId: string };

async function respond(
  { logger, port }: ControllerDependencies,
  operation: ConversationTransportOperation,
  request: Request,
  action: () => Promise<Response>,
) {
  try {
    const origin = getLoopbackOrigin(request.headers, port);

    if (!origin) throw new RequestError("forbidden_origin");

    if (request.method !== "GET" && request.method !== "HEAD")
      verifyWriteOrigin(request.headers, origin);

    return await action();
  } catch (cause) {
    const code = toHttpFailure(cause);
    const [status, message] = httpFailures[code];

    if (
      (code === "corrupt_thread" || code === "storage_unavailable") &&
      !wasAborted(cause, request.signal)
    )
      logger.error({ operation, phase: "http", code, status });

    const headers = new Headers({ "Cache-Control": "no-store" });

    if (code === "request_timeout" || code === "payload_too_large")
      headers.set("Connection", "close");

    return Response.json(ApiErrorResponse.parse({ error: { code, message } }), {
      status,
      headers,
    });
  }
}

async function listConversations({ getServices }: ControllerDependencies) {
  const { management } = await getServices();

  return Response.json(ConversationListResponse.parse({ conversations: await management.list() }), {
    headers: { "Cache-Control": "no-store" },
  });
}

async function createConversation({ getServices }: ControllerDependencies, request: Request) {
  const { id } = await parseBody(CreateConversationInput, request);
  // Reject malformed requests before initializing services.
  // react-doctor-disable-next-line react-doctor/server-sequential-independent-await
  const { management } = await getServices();
  const { created, conversation } = await management.create(id);

  return Response.json(ConversationResponse.parse({ conversation }), {
    status: created ? 201 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}

async function loadConversation(
  { getServices }: ControllerDependencies,
  params: ConversationPath | Promise<ConversationPath>,
) {
  const id = parseInput(Identifier.safeParse((await params).id));
  const { management } = await getServices();

  return Response.json(SavedConversation.parse(await management.load(id)), {
    headers: { "Cache-Control": "no-store" },
  });
}

async function sendTurn(
  { getServices, logger }: ControllerDependencies,
  request: Request,
  params: ConversationPath | Promise<ConversationPath>,
) {
  const id = parseInput(Identifier.safeParse((await params).id));
  const input = await parseBody(SendTurnInput, request);
  // Reject malformed requests before initializing services.
  // react-doctor-disable-next-line react-doctor/server-sequential-independent-await
  const { chat } = await getServices();

  return streamTurn(logger, "send", input.turnId, request, (signal) =>
    chat.send(id, input, signal),
  );
}

async function retryTurn(
  { getServices, logger }: ControllerDependencies,
  request: Request,
  params: RetryPath | Promise<RetryPath>,
) {
  const path = await params;
  const id = parseInput(Identifier.safeParse(path.id));
  const turnId = parseInput(Identifier.safeParse(path.turnId));
  const { expectedAttempt } = await parseBody(RetryTurnInput, request);
  // Reject malformed requests before initializing services.
  // react-doctor-disable-next-line react-doctor/server-sequential-independent-await
  const { chat } = await getServices();

  return streamTurn(logger, "retry", turnId, request, (signal) =>
    chat.retry(id, turnId, expectedAttempt, signal),
  );
}

export function createConversationController(dependencies: ControllerDependencies) {
  return {
    list: (request: Request) =>
      respond(dependencies, "list", request, () => listConversations(dependencies)),
    create: (request: Request) =>
      respond(dependencies, "create", request, () => createConversation(dependencies, request)),
    load: (request: Request, params: ConversationPath | Promise<ConversationPath>) =>
      respond(dependencies, "load", request, () => loadConversation(dependencies, params)),
    send: (request: Request, params: ConversationPath | Promise<ConversationPath>) =>
      respond(dependencies, "send", request, () => sendTurn(dependencies, request, params)),
    retry: (request: Request, params: RetryPath | Promise<RetryPath>) =>
      respond(dependencies, "retry", request, () => retryTurn(dependencies, request, params)),
  };
}
