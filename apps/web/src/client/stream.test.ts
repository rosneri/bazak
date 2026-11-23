import { test } from "node:test";
import assert from "node:assert/strict";
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
