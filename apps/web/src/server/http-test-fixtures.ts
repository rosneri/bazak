import assert from "node:assert/strict";
import type { ConversationEvent } from "@bazak/conversation/application/chat";
import type { TurnEvent } from "@bazak/conversation/domain/turn";
import { createConversationController } from "./http.ts";
import type { ConversationTransportError } from "./logger.ts";
import type { ShopperServices } from "./services.ts";

export const id = crypto.randomUUID();

export const turnId = crypto.randomUUID();

export const host = "localhost:3000";

export const origin = "http://" + host;

export const conversation = {
  id,
  title: "New chat",
  createdAt: "2026-11-23T00:00:00.000Z",
  updatedAt: "2026-11-23T00:00:00.000Z",
};

const part = {
  type: "products",
  version: 1,
  group: {
    kind: "empty",
    label: "Lamps",
    criteria: { keywords: "lamp" },
    products: [],
    coverage: "exhaustive",
    message: "No matching lamps were found.",
  },
} as const;

export const assistant = { parts: [{ ...part, group: { ...part.group, products: [] } }] };

export const status = {
  type: "status",
  turnId,
  state: "running",
  attempt: 1,
} as const satisfies TurnEvent;

export const results = { type: "products", turnId, part: assistant.parts[0] } satisfies TurnEvent;

export const textDelta = {
  type: "text-delta",
  turnId,
  text: "Here’s what I found.",
} satisfies TurnEvent;

export const done = { type: "done", turnId, assistant } satisfies TurnEvent;

export const saveFailure: TurnEvent = {
  type: "error",
  turnId,
  code: "storage_unavailable",
  message: "This reply could not be saved. Reload the conversation to check its status.",
};

export const streamInterruption: TurnEvent = {
  type: "error",
  turnId,
  code: "stream_interrupted",
  message: "This reply was interrupted. Reload to check its saved status.",
};

export function events(sequence: ConversationEvent[]) {
  return (async function* () {
    yield* sequence;
  })();
}

export function baseline(): ShopperServices {
  return {
    management: {
      create: async () => ({ created: true, conversation }),
      list: async () => [conversation],
      load: async () => ({ conversation, turns: [] }),
    },
    chat: {
      send: async () => events([status, results, textDelta, done]),
      retry: async () => events([{ ...status, state: "completed", attempt: 2 }, done]),
    },
  };
}

export function setup(services = baseline()) {
  const errors: ConversationTransportError[] = [];

  const api = createConversationController({
    getServices: async () => services,
    logger: { error: (event) => errors.push(event) },
    port: "3000",
  });

  return { api, errors };
}

export function rejectingController() {
  return createConversationController({
    getServices: () => assert.fail("Rejected requests must not initialize services."),
    logger: { error: () => assert.fail("Rejected requests must not log a server error.") },
    port: "3000",
  });
}

export function read(headers: Record<string, string> = {}) {
  return new Request(origin + "/api/conversations", { headers: { Host: host, ...headers } });
}

export function write(body: BodyInit, headers: Record<string, string> = {}, signal?: AbortSignal) {
  const init = {
    method: "POST",
    headers: { Host: host, ...headers },
    body,
    signal,
    duplex: "half",
  };

  return new Request(origin + "/api/conversations", init);
}

export const post = (
  body: { id: string } | { turnId: string; text: string } | { expectedAttempt: number },
  signal?: AbortSignal,
) => write(JSON.stringify(body), { "Content-Type": "application/json" }, signal);
