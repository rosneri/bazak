import { test } from "node:test";
import assert from "node:assert/strict";
import { ZodError } from "zod";
import { sendTurn } from "../api/generated/hooks";
import { RequestProblem } from "../api/fetch";
import { readTurnStream } from "./stream.ts";

const event = { type: "text-delta", turnId: crypto.randomUUID(), text: "Here’s a café ☕️." };

function response(text: string) {
  const bytes = new TextEncoder().encode(text);

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream; charset=utf-8" } },
  );
}

test("UTF-8, split line endings, comments and several SSE events", async () => {
  const events = await Array.fromAsync(
    readTurnStream(
      response(
        ": ping\r\n\r\ndata: " +
          JSON.stringify(event) +
          "\r\n\r\ndata: " +
          JSON.stringify(event) +
          "\n\n",
      ),
    ),
  );

  assert.deepEqual(events, [event, event]);
});

test("a partial last event or a non-SSE response requires reconciliation", async () => {
  await assert.rejects(
    Array.fromAsync(readTurnStream(response("data: " + JSON.stringify(event)))),
    /interrupted/,
  );
  await assert.rejects(Array.fromAsync(readTurnStream(Response.json(event))), /reply stream/);
});

test("invalid event data is rejected at the stream boundary", async () => {
  const frame = { type: "status", turnId: event.turnId, state: "running", attempt: 0 };

  await assert.rejects(
    Array.fromAsync(readTurnStream(response("data: " + JSON.stringify(frame) + "\n\n"))),
    ZodError,
  );
});

test("generated send decodes a conflict from the JSON error envelope", async ({ mock }) => {
  const message = "Another reply is in progress.";
  mock.method(globalThis, "fetch", async () =>
    Response.json({ error: { code: "thread_busy", message } }, { status: 409 }),
  );

  await assert.rejects(
    sendTurn(crypto.randomUUID(), { turnId: event.turnId, text: "Find a desk lamp" }),
    (cause) =>
      cause instanceof RequestProblem && cause.code === "thread_busy" && cause.message === message,
  );
});

test(
  "generated send returns before stream bytes and forwards cancellation",
  { timeout: 2000 },
  async ({ mock }) => {
    const controller = new AbortController();
    mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
      const { signal } = options;
      assert.equal(signal, controller.signal);

      return new Response(
        new ReadableStream({
          start(stream) {
            signal.addEventListener("abort", () => stream.error(signal.reason), { once: true });
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    });

    const reply = await sendTurn(
      crypto.randomUUID(),
      { turnId: event.turnId, text: "Find a desk lamp" },
      { signal: controller.signal },
    );

    const pending = readTurnStream(reply).next();
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
  },
);
