import assert from "node:assert/strict";
import { test } from "node:test";
import { RepositoryError, type RepositoryCode } from "@bazak/conversation/application/repository";
import type { TurnEvent } from "@bazak/conversation/domain/turn";
import { conversationHandlers } from "./http.ts";
import { readTurnStream } from "../client/stream.ts";
import type { ShopperServices } from "./services.ts";

const id = crypto.randomUUID();

const turnId = crypto.randomUUID();

const conversation = {
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

const assistant = { parts: [{ ...part, group: { ...part.group, products: [] } }] };

const status = {
  type: "status",
  turnId,
  state: "running",
  attempt: 1,
} as const satisfies TurnEvent;

const results: TurnEvent = { type: "products", turnId, part: assistant.parts[0] };

const done: TurnEvent = { type: "done", turnId, assistant };

function events(sequence: TurnEvent[]) {
  return (async function* () {
    yield* sequence;
  })();
}

function baseline(): ShopperServices {
  return {
    management: {
      create: async () => ({ created: true, conversation }),
      list: async () => [conversation],
      load: async () => ({ conversation, turns: [] }),
    },
    chat: {
      send: async () =>
        events([
          status,
          results,
          { type: "text-delta", turnId, text: "Here’s what I found." },
          done,
        ]),
      retry: async () => events([{ ...status, state: "completed", attempt: 2 }, done]),
    },
  };
}

const post = (
  body: { id: string } | { turnId: string; text: string } | { expectedAttempt: number },
) =>
  new Request("http://localhost/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("create, repeated create, list and load validate the response contract", async () => {
  const services = baseline();
  const api = conversationHandlers(services);
  const created = await api.create(post({ id }));
  assert.equal(created.status, 201);
  assert.match(created.headers.get("Content-Type") ?? "", /application\/json/);
  assert.deepEqual(await created.json(), { conversation });
  services.management.create = async () => ({ created: false, conversation });
  assert.equal((await api.create(post({ id }))).status, 200);
  assert.deepEqual(await (await api.list()).json(), { conversations: [conversation] });
  assert.deepEqual(await (await api.load(id)).json(), { conversation, turns: [] });
});

test("send streams validated versioned parts and committed completion in order", async () => {
  const response = await conversationHandlers(baseline()).send(
    id,
    post({ turnId, text: "Find lamps." }),
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type") ?? "", /^text\/event-stream; charset=utf-8/);
  assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
  assert.deepEqual(await Array.fromAsync(readTurnStream(response)), [
    status,
    results,
    { type: "text-delta", turnId, text: "Here’s what I found." },
    done,
  ]);
});

test("completed retry replays the canonical message; duplicate pending turn only sends status", async () => {
  const services = baseline();
  const api = conversationHandlers(services);
  services.chat.retry = async (thread, turn, expected) => {
    assert.deepEqual([thread, turn, expected], [id, turnId, 1]);

    return events([{ ...status, state: "completed", attempt: 2 }, done]);
  };

  assert.deepEqual(
    await Array.fromAsync(
      readTurnStream(await api.retry(id, turnId, post({ expectedAttempt: 1 }))),
    ),
    [{ ...status, state: "completed", attempt: 2 }, done],
  );
  services.chat.send = async () => events([status]);
  assert.deepEqual(
    await Array.fromAsync(
      readTurnStream(await api.send(id, post({ turnId, text: "Find lamps." }))),
    ),
    [status],
  );
});

test("bad paths, invalid JSON, a blank message and invalid retry generations return JSON 400", async () => {
  const api = conversationHandlers(baseline());

  const responses = [
    api.load("invalid"),
    api.send(id, post({ turnId, text: " " })),
    api.retry(id, turnId, post({ expectedAttempt: 0 })),
    api.create(new Request("http://localhost", { method: "POST", body: "{" })),
  ];

  await Promise.all(
    responses.map(async (pending) => {
      const response = await pending;
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, "invalid_input");
    }),
  );
});

test("repository conflicts, missing turns, corrupt history and pre-stream storage failure map to safe HTTP responses", async () => {
  const cases: [RepositoryCode, number][] = [
    ["not_found", 404],
    ["thread_busy", 409],
    ["turn_conflict", 409],
    ["attempt_conflict", 409],
    ["corrupt_thread", 500],
    ["storage_unavailable", 503],
  ];

  await Promise.all(
    cases.map(async ([code, expected]) => {
      const services = baseline();
      services.chat.send = async () => {
        throw new RepositoryError(code);
      };

      const response = await conversationHandlers(services).send(
        id,
        post({ turnId, text: "Find lamps." }),
      );

      assert.equal(response.status, expected);
      assert.equal((await response.json()).error.code, code);
      assert.match(response.headers.get("Content-Type") ?? "", /application\/json/);
    }),
  );
});

test("storage failure after first output closes with error and excludes completion", async () => {
  const services = baseline();
  services.chat.send = async () =>
    (async function* () {
      yield status;
      yield results;
      throw new Error("private database details");
    })();

  const response = await conversationHandlers(services).send(
    id,
    post({ turnId, text: "Find lamps." }),
  );

  const frames = await Array.fromAsync(readTurnStream(response));
  assert.deepEqual(
    frames.map((event) => event.type),
    ["status", "products", "error"],
  );
  assert.doesNotMatch(JSON.stringify(frames), /private database/);
});
