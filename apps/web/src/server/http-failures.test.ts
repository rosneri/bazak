import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { RepositoryError, type RepositoryCode } from "@bazak/conversation/application/repository";
import { readTurnStream } from "../client/stream.ts";
import {
  id,
  turnId,
  status,
  results,
  textDelta,
  done,
  saveFailure,
  streamInterruption,
  events,
  baseline,
  setup,
  read,
  post,
} from "./http-test-fixtures.ts";

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
