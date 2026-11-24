import assert from "node:assert/strict";
import { test } from "node:test";
import { readTurnStream } from "../client/stream.ts";
import {
  id,
  turnId,
  host,
  origin,
  status,
  results,
  textDelta,
  done,
  events,
  baseline,
  setup,
  rejectingController,
  read,
  write,
  post,
} from "./http-test-fixtures.ts";

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
