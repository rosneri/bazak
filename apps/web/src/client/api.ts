import { z } from "zod";
import {
  conversationSchema,
  conversationHistorySchema,
  sendTurnInputSchema,
  createConversationInputSchema,
  retryTurnInputSchema,
} from "@bazak/conversation/domain/turn";

const list = z
  .strictObject({ conversations: z.array(conversationSchema).describe("Saved shopper threads.") })
  .describe("Conversation listing.");

const created = z
  .strictObject({ conversation: conversationSchema })
  .describe("New or recovered thread.");

const problem = z
  .object({
    error: z
      .object({
        code: z.string().describe("Machine-readable problem."),
        message: z.string().describe("Safe user-facing explanation."),
      })
      .describe("Request problem metadata."),
  })
  .describe("Failed request.");

export class RequestProblem extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const conversationPath = (id: string) => "/api/conversations/" + encodeURIComponent(id);

type RequestBody = z.infer<
  typeof createConversationInputSchema | typeof sendTurnInputSchema | typeof retryTurnInputSchema
>;

async function request(path: string, signal: AbortSignal, body?: RequestBody) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    signal,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const parsed = problem.safeParse(await response.json().catch(() => null));

    if (parsed.success) throw new RequestProblem(parsed.data.error.code, parsed.data.error.message);
    throw new Error("The server could not be reached.");
  }

  return response;
}

export async function listChats(signal: AbortSignal) {
  return list.parse(await (await request("/api/conversations", signal)).json()).conversations;
}

export async function loadChat(id: string, signal: AbortSignal) {
  return conversationHistorySchema.parse(
    await (await request(conversationPath(id), signal)).json(),
  );
}

export async function createChat(id: string, signal: AbortSignal) {
  return created.parse(await (await request("/api/conversations", signal, { id })).json())
    .conversation;
}

export const submitTurn = (id: string, turnId: string, text: string, signal: AbortSignal) =>
  request(conversationPath(id) + "/turns", signal, { turnId, text });

export const retryTurn = (
  id: string,
  turnId: string,
  expectedAttempt: number,
  signal: AbortSignal,
) =>
  request(conversationPath(id) + "/turns/" + encodeURIComponent(turnId) + "/retry", signal, {
    expectedAttempt,
  });
