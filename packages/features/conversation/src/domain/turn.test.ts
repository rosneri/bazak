import assert from "node:assert/strict";
import { test } from "node:test";
import { assistantMessageSchema, storedMetricsSchema } from "@bazak/conversation/domain/turn";

test("a saved assistant reply accepts only registered presentation parts", () => {
  assert.ok(
    assistantMessageSchema.safeParse({ parts: [{ type: "text", text: "What is your budget?" }] })
      .success,
  );
  assert.equal(
    assistantMessageSchema.safeParse({ parts: [{ type: "html", html: "A new card type" }] })
      .success,
    false,
  );
});

test("saved metrics from older turns remain readable", () => {
  const metrics = {
    intentCalls: 1,
    plannerCalls: 0,
    catalogCalls: 0,
    queries: [],
    planner: [],
    firstVisibleMs: 2,
    durationMs: 3,
    usage: [],
    stepInputs: [],
  };

  assert.deepEqual(
    storedMetricsSchema.parse({
      ...metrics,
      replyCalls: 1,
      stepInputs: [{ stage: "reply", name: "Prompt", value: "{}" }],
    }),
    metrics,
  );
});
