import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import type { ConversationEvent } from "@bazak/conversation/application/chat";
import { RepositoryError, type RepositoryCode } from "@bazak/conversation/application/repository";
import type { TurnEvent } from "@bazak/conversation/domain/turn";
import { createConversationController } from "./http.ts";
import { readTurnStream } from "../client/stream.ts";
import type { ConversationTransportError } from "./logger.ts";
import type { ShopperServices } from "./services.ts";

const id = crypto.randomUUID();

const turnId = crypto.randomUUID();

const host = "localhost:3000";

const origin = "http://" + host;

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

const results = { type: "products", turnId, part: assistant.parts[0] } satisfies TurnEvent;

const textDelta = { type: "text-delta", turnId, text: "Here’s what I found." } satisfies TurnEvent;

const done = { type: "done", turnId, assistant } satisfies TurnEvent;

const saveFailure: TurnEvent = {
  type: "error",
  turnId,
  code: "storage_unavailable",
  message: "This reply could not be saved. Reload the conversation to check its status.",
};

const streamInterruption: TurnEvent = {
  type: "error",
  turnId,
  code: "stream_interrupted",
  message: "This reply was interrupted. Reload to check its saved status.",
};

function events(sequence: ConversationEvent[]) {
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
      send: async () => events([status, results, textDelta, done]),
      retry: async () => events([{ ...status, state: "completed", attempt: 2 }, done]),
    },
  };
}

function setup(services = baseline()) {
  const errors: ConversationTransportError[] = [];

  const api = createConversationController({
    getServices: async () => services,
    logger: { error: (event) => errors.push(event) },
    port: "3000",
  });

  return { api, errors };
}

function rejectingController() {
  return createConversationController({
    getServices: () => assert.fail("Rejected requests must not initialize services."),
    logger: { error: () => assert.fail("Rejected requests must not log a server error.") },
    port: "3000",
  });
}

function read(headers: Record<string, string> = {}) {
  return new Request(origin + "/api/conversations", { headers: { Host: host, ...headers } });
}

function write(body: BodyInit, headers: Record<string, string> = {}, signal?: AbortSignal) {
  const init = {
    method: "POST",
    headers: { Host: host, ...headers },
    body,
    signal,
    duplex: "half",
  };

  return new Request(origin + "/api/conversations", init);
}

const post = (
  body: { id: string } | { turnId: string; text: string } | { expectedAttempt: number },
  signal?: AbortSignal,
) => write(JSON.stringify(body), { "Content-Type": "application/json" }, signal);

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

test("saved history preserves nullable attempts and complete ordered reply metadata", async () => {
  const services = baseline();

  const history = {
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

  services.management.load = async () => history;
  const { api, errors } = setup(services);

  const response = await api.load(read(), { id });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), history);
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

test("bad paths, invalid JSON, a blank message and invalid retry generations return JSON 400", async () => {
  const { api, errors } = setup();

  const responses = [
    api.load(read(), { id: "invalid" }),
    api.send(post({ turnId, text: " " }), { id }),
    api.retry(post({ expectedAttempt: 0 }), { id, turnId }),
    api.retry(post({ expectedAttempt: 1 }), { id, turnId: "invalid" }),
    api.create(write("{", { "Content-Type": "application/json" })),
  ];

  await Promise.all(
    responses.map(async (pending) => {
      const response = await pending;
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, "invalid_input");
    }),
  );
  assert.deepEqual(errors, []);
});

test("generated request validators reject extra properties and limits before initializing services", async () => {
  const createExtra = { id, title: "Undocumented" };
  const sendExtra = { turnId, text: "Find lamps.", state: "completed" };
  const retryExtra = { expectedAttempt: 1, text: "Replacement text" };

  const api = rejectingController();

  await Promise.all(
    [
      api.create(post(createExtra)),
      api.send(post(sendExtra), { id }),
      api.send(post({ turnId, text: "😀".repeat(4_001) }), { id }),
      api.retry(post(retryExtra), { id, turnId }),
      api.retry(post({ expectedAttempt: Number.MAX_SAFE_INTEGER + 1 }), { id, turnId }),
    ].map(async (pending) => {
      const response = await pending;
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, "invalid_input");
    }),
  );
});

test("requests use the configured local host and port before loading shopper data", async () => {
  const api = rejectingController();

  const requests = [
    api.list(read({ Host: "example.test:3000", "X-Forwarded-Host": host })),
    api.load(read({ Host: "127.0.0.1:3001" }), { id }),
    api.create(write(JSON.stringify({ id }), { Host: "example.test:3000", Origin: origin })),
  ];

  for (const response of await Promise.all(requests)) {
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    // oxlint-disable-next-line no-await-in-loop -- Each response has its own error body.
    assert.equal((await response.json()).error.code, "forbidden_origin");
  }
});

test("create, send and retry reject foreign browser origins and non-JSON writes", async () => {
  const api = rejectingController();

  const operations = [
    { invoke: api.create, body: { id } },
    {
      invoke: (request: Request) => api.send(request, { id }),
      body: { turnId, text: "Find lamps." },
    },
    {
      invoke: (request: Request) => api.retry(request, { id, turnId }),
      body: { expectedAttempt: 1 },
    },
  ];

  const mediaType = { "Content-Type": "application/json" };

  const cases: [Record<string, string>, number, string][] = [
    [{ ...mediaType, Origin: "http://localhost:3001" }, 403, "forbidden_origin"],
    [{ ...mediaType, "Sec-Fetch-Site": "cross-site" }, 403, "forbidden_origin"],
    [{ ...mediaType, "Sec-Fetch-Site": "same-site" }, 403, "forbidden_origin"],
    [{ ...mediaType, Origin: "null", Referer: origin }, 403, "forbidden_origin"],
    [{ ...mediaType, Referer: "http://example.test/" }, 403, "forbidden_origin"],
    [{ "Content-Type": "text/plain" }, 415, "unsupported_media_type"],
    [{ ...mediaType, "Content-Encoding": "gzip" }, 415, "unsupported_media_type"],
  ];

  await Promise.all(
    operations.flatMap(({ invoke, body }) =>
      cases.map(async ([headers, expectedStatus, code]) => {
        const response = await invoke(write(JSON.stringify(body), headers));

        assert.equal(response.status, expectedStatus);
        assert.equal((await response.json()).error.code, code);
      }),
    ),
  );
});

test("same-origin browser headers and UTF-8 JSON are accepted", async () => {
  const { api } = setup();

  const created = await api.create(
    write(JSON.stringify({ id }), {
      Host: "127.0.0.1:3000",
      "Content-Type": 'application/json; charset="UTF-8"',
      "Sec-Fetch-Site": "same-origin",
      Origin: "http://127.0.0.1:3000",
    }),
  );

  assert.equal(created.status, 201);

  const sent = await api.send(
    write(JSON.stringify({ turnId, text: "Find lamps." }), {
      "Content-Type": "application/json",
      Referer: origin + "/conversations/" + id,
    }),
    { id },
  );

  assert.deepEqual(await Array.fromAsync(readTurnStream(sent)), [status, results, textDelta, done]);
});

test("a declared over-limit body is rejected before reading it", async () => {
  const api = rejectingController();
  let pulled = false;

  const body = new ReadableStream<Uint8Array>(
    {
      pull() {
        pulled = true;
      },
    },
    { highWaterMark: 0 },
  );

  const response = await api.create(
    write(body, {
      "Content-Type": "application/json",
      "Content-Length": "65537",
    }),
  );

  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "payload_too_large");
  assert.equal(response.headers.get("Connection"), "close");
  assert.equal(pulled, false);
});

test("chunked bodies over the byte limit are cancelled before a service is initialized", async () => {
  const api = rejectingController();
  const chunk = new TextEncoder().encode("א".repeat(17_000));
  let cancelled = false;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(chunk);
      controller.enqueue(chunk);
    },
    cancel() {
      cancelled = true;
    },
  });

  const response = await api.retry(write(body, { "Content-Type": "application/json" }), {
    id,
    turnId,
  });

  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "payload_too_large");
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});

test("the byte limit includes the exact boundary and invalid UTF-8 returns a request error", async () => {
  const { api } = setup();
  const headers = { "Content-Type": "application/json" };
  const json = JSON.stringify({ id }).padEnd(65_536, " ");
  const created = await api.create(write(json, { ...headers, "Content-Length": "65536" }));

  assert.equal(created.status, 201);

  const rejected = await rejectingController().create(write(new Uint8Array([255]), headers));

  assert.equal(rejected.status, 400);
  assert.equal((await rejected.json()).error.code, "invalid_input");
});

test("a stalled body times out and releases the reader", async ({ mock }) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const api = rejectingController();
  let cancelled = false;

  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });

  const pending = api.create(write(body, { "Content-Type": "application/json" }));
  mock.timers.tick(10_000);
  const response = await pending;

  assert.equal(response.status, 408);
  assert.equal((await response.json()).error.code, "request_timeout");
  assert.equal(response.headers.get("Connection"), "close");
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});

test("send preserves leading and trailing shopper whitespace at the length limit", async () => {
  const text = " " + "😀".repeat(3_998) + " ";
  const services = baseline();
  services.chat.send = async (thread, input) => {
    assert.equal(thread, id);
    assert.deepEqual(input, { turnId, text });

    return events([status]);
  };

  const { api, errors } = setup(services);

  const response = await api.send(post({ turnId, text }), { id });

  assert.equal(response.status, 200);
  assert.deepEqual(await Array.fromAsync(readTurnStream(response)), [status]);
  assert.deepEqual(errors, []);
});

test("repository errors before streaming return safe HTTP errors", async () => {
  const cases: [RepositoryCode, number, string][] = [
    ["not_found", 404, "This chat or turn could not be found."],
    [
      "thread_busy",
      409,
      "Another reply is in progress. Your draft is ready to send once it finishes.",
    ],
    ["turn_conflict", 409, "This message ID already belongs to another message."],
    ["attempt_conflict", 409, "This attempt changed. Reload the chat to see its status."],
    ["corrupt_thread", 500, "This chat could not be read. You can still open other chats."],
    ["storage_unavailable", 503, "Chat storage is unavailable. Reconnect and try again."],
  ];

  await Promise.all(
    cases.map(async ([code, expectedStatus, message]) => {
      const services = baseline();
      services.chat.send = async () => {
        const error = new RepositoryError(code);
        error.message = "private database details";
        throw error;
      };

      const { api, errors } = setup(services);
      const response = await api.send(post({ turnId, text: "Find lamps." }), { id });

      assert.equal(response.status, expectedStatus);
      assert.match(response.headers.get("Content-Type") ?? "", /application\/json/);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.deepEqual(await response.json(), { error: { code, message } });
      assert.deepEqual(
        errors,
        expectedStatus >= 500
          ? [{ operation: "send", phase: "http", code, status: expectedStatus }]
          : [],
      );
    }),
  );
});

test("an unexpected service rejection returns and logs one safe HTTP error", async () => {
  const services = baseline();
  services.management.load = async () => {
    throw new SyntaxError("private stored value");
  };

  const { api, errors } = setup(services);
  const response = await api.load(read(), { id });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: {
      code: "storage_unavailable",
      message: "Chat storage is unavailable. Reconnect and try again.",
    },
  });
  assert.deepEqual(errors, [
    { operation: "load", phase: "http", code: "storage_unavailable", status: 503 },
  ]);
});

test(
  "an abort during turn acquisition does not log a transport error",
  { timeout: 2_000 },
  async () => {
    const request = new AbortController();
    const acquiring = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const services = baseline();
    services.chat.send = async (_id, _input, signal) => {
      assert.ok(signal);
      acquiring.resolve();
      await release.promise;
      signal.throwIfAborted();

      return events([status]);
    };

    const { api, errors } = setup(services);
    const pending = api.send(post({ turnId, text: "Find lamps." }, request.signal), { id });

    await acquiring.promise;
    request.abort();
    release.resolve();

    assert.equal((await pending).status, 503);
    assert.deepEqual(errors, []);
  },
);

test("a reported application failure ends the stream with its safe shopper message", async () => {
  const services = baseline();
  services.chat.send = async () =>
    (async function* () {
      yield status;
      yield results;
      yield { type: "error", turnId, code: "storage_unavailable" } as const;
    })();

  const { api, errors } = setup(services);
  const response = await api.send(post({ turnId, text: "Find lamps." }), { id });

  assert.deepEqual(await Array.fromAsync(readTurnStream(response)), [status, results, saveFailure]);
  assert.deepEqual(errors, [{ operation: "send", phase: "stream", code: "storage_unavailable" }]);
});

test("a thrown repository error during retry ends the stream with a safe shopper message", async () => {
  const services = baseline();
  const runningRetry = { ...status, attempt: 2 };
  services.chat.retry = async () =>
    (async function* () {
      yield runningRetry;
      const error = new RepositoryError("storage_unavailable");
      error.message = "private database details";
      throw error;
    })();

  const { api, errors } = setup(services);
  const response = await api.retry(post({ expectedAttempt: 1 }), { id, turnId });

  assert.deepEqual(await Array.fromAsync(readTurnStream(response)), [runningRetry, saveFailure]);
  assert.deepEqual(errors, [{ operation: "retry", phase: "stream", code: "storage_unavailable" }]);
});

test("an iterator failure after a preview closes with a safe stream interruption", async () => {
  const services = baseline();
  services.chat.send = async () =>
    (async function* () {
      yield status;
      yield results;
      throw new Error("private database details");
    })();

  const { api, errors } = setup(services);
  const response = await api.send(post({ turnId, text: "Find lamps." }), { id });

  assert.deepEqual(await Array.fromAsync(readTurnStream(response)), [
    status,
    results,
    streamInterruption,
  ]);
  assert.deepEqual(errors, [{ operation: "send", phase: "stream", code: "stream_interrupted" }]);
});

test(
  "an invalid event closes the stream and logs one failure even if iterator cleanup throws",
  { timeout: 2_000 },
  async () => {
    const services = baseline();
    const released = Promise.withResolvers<void>();
    services.chat.send = async () => {
      const iterator = events([status, { ...textDelta, text: "" }, done]);
      const close = iterator.return.bind(iterator);
      iterator.return = async (value) => {
        await close(value);
        released.resolve();
        throw new Error("private cleanup failure");
      };

      return iterator;
    };

    const { api, errors } = setup(services);
    const response = await api.send(post({ turnId, text: "Find lamps." }), { id });

    assert.deepEqual(await Array.fromAsync(readTurnStream(response)), [status, streamInterruption]);
    await released.promise;
    // The stream may close before it handles the cleanup rejection.
    await setImmediate();
    assert.deepEqual(errors, [{ operation: "send", phase: "stream", code: "stream_interrupted" }]);
  },
);

for (const source of ["response cancellation", "request abort"] as const) {
  test(
    `${source} aborts a pending retry and releases its iterator`,
    { timeout: 2_000 },
    async () => {
      const request = new AbortController();
      const waiting = Promise.withResolvers<AbortSignal>();
      const released = Promise.withResolvers<void>();
      const services = baseline();
      services.chat.retry = async (_id, _turnId, _expectedAttempt, signal) => {
        assert.ok(signal);

        return (async function* () {
          try {
            yield { ...status, attempt: 2 };
            waiting.resolve(signal);
            signal.throwIfAborted();
            await new Promise<never>((_resolve, reject) => {
              signal.addEventListener("abort", () => reject(signal.reason), { once: true });
            });
          } finally {
            released.resolve();
          }
        })();
      };

      const { api, errors } = setup(services);

      const response = await api.retry(post({ expectedAttempt: 1 }, request.signal), {
        id,
        turnId,
      });

      assert.ok(response.body);
      const reader = response.body.getReader();
      assert.equal((await reader.read()).done, false);
      const next = reader.read();
      const upstream = await waiting.promise;

      if (source === "request abort") request.abort();
      else await reader.cancel();

      assert.deepEqual(await next, { done: true, value: undefined });
      await released.promise;
      assert.equal(upstream.aborted, true);
      assert.deepEqual(errors, []);
    },
  );
}
