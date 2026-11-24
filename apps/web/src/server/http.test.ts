import assert from "node:assert/strict";
import { test } from "node:test";
import { readTurnStream } from "../client/stream.ts";
import type { ShopperServices } from "./services.ts";
import {
  id,
  turnId,
  conversation,
  status,
  results,
  textDelta,
  done,
  events,
  baseline,
  setup,
  read,
  post,
} from "./http-test-fixtures.ts";

test("create, repeated create, list and load return the shopper's saved conversation", async () => {
  const services = baseline();
  const { api, errors } = setup(services);
  const created = await api.create(post({ id }));
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("Cache-Control"), "no-store");
  assert.match(created.headers.get("Content-Type") ?? "", /application\/json/);
  assert.deepEqual(await created.json(), { conversation });
  services.management.create = async () => ({ created: false, conversation });
  const repeated = await api.create(post({ id }));
  assert.equal(repeated.status, 200);
  assert.deepEqual(await repeated.json(), { conversation });

  const listed = await api.list(read());
  assert.equal(listed.status, 200);
  assert.equal(listed.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await listed.json(), { conversations: [conversation] });

  const loaded = await api.load(read(), Promise.resolve({ id }));
  assert.equal(loaded.status, 200);
  assert.equal(loaded.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await loaded.json(), { conversation, turns: [] });
  assert.deepEqual(errors, []);
});

const savedHistory = {
  conversation,
  turns: [
    {
      turnId,
      text: "Find lamps.",
      state: "completed",
      attempt: 2,
      assistant: {
        parts: [
          {
            type: "products",
            version: 1,
            group: {
              kind: "matched",
              label: "Lamps",
              criteria: { keywords: "lamp", count: 2 },
              products: [
                {
                  id: "42",
                  title: "Desk lamp",
                  description: "",
                  price: 19.99,
                  stock: 2,
                  imageUrl: "https://example.com/lamp.png",
                  observedAt: conversation.updatedAt,
                },
              ],
              coverage: "partial",
              message: "One lamp matched.",
            },
          },
          { type: "text", text: "Here is the lamp I found." },
        ],
      },
      decision: {
        kind: "discover",
        searches: [
          {
            kind: "search",
            label: "Lamps",
            criteria: { keywords: "lamp", count: 2 },
            readiness: "ready",
          },
        ],
      },
      metrics: {
        intentCalls: 1,
        plannerCalls: 0,
        catalogCalls: 1,
        replyCalls: 1,
        queries: [{ source: { kind: "search", keywords: "lamp" }, offset: 0, limit: 2 }],
        planner: ["skipped"],
        firstVisibleMs: 100,
        durationMs: 150,
      },
    },
    {
      turnId: crypto.randomUUID(),
      text: "Find chairs.",
      state: "running",
      attempt: 1,
      assistant: null,
      decision: null,
      metrics: null,
    },
  ],
} satisfies Awaited<ReturnType<ShopperServices["management"]["load"]>>;

test("saved history preserves nullable attempts and complete ordered reply metadata", async () => {
  const services = baseline();

  services.management.load = async () => savedHistory;
  const { api, errors } = setup(services);

  const response = await api.load(read(), { id });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), savedHistory);
  assert.deepEqual(errors, []);
});

test("send streams versioned parts and committed completion as ordered UTF-8 data frames", async () => {
  const { api, errors } = setup();
  const response = await api.send(post({ turnId, text: "Find lamps." }), { id });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "text/event-stream; charset=utf-8");
  const cacheDirectives = response.headers.get("Cache-Control")?.split(/,\s*/);
  assert.ok(cacheDirectives);
  assert.ok(cacheDirectives.includes("no-store"));
  assert.ok(cacheDirectives.includes("no-transform"));
  assert.equal(response.headers.get("X-Accel-Buffering"), "no");
  assert.match(await response.clone().text(), /^(?:data: \{[^\n]+\}\n\n){4}$/);
  assert.deepEqual(await Array.fromAsync(readTurnStream(response)), [
    status,
    results,
    textDelta,
    done,
  ]);
  assert.deepEqual(errors, []);
});

test("completed retry replays the committed message and a duplicate pending turn only sends status", async () => {
  const services = baseline();
  const { api, errors } = setup(services);
  services.chat.retry = async (thread, turn, expected) => {
    assert.deepEqual([thread, turn, expected], [id, turnId, 1]);

    return events([{ ...status, state: "completed", attempt: 2 }, done]);
  };

  assert.deepEqual(
    await Array.fromAsync(
      readTurnStream(await api.retry(post({ expectedAttempt: 1 }), { id, turnId })),
    ),
    [{ ...status, state: "completed", attempt: 2 }, done],
  );
  services.chat.send = async () => events([status]);
  assert.deepEqual(
    await Array.fromAsync(
      readTurnStream(await api.send(post({ turnId, text: "Find lamps." }), { id })),
    ),
    [status],
  );
  assert.deepEqual(errors, []);
});
