import assert from "node:assert/strict";
import { test } from "node:test";
import {
  combineUsage,
  formatUsage,
  summarizeCalls,
  type CallUsage,
} from "@bazak/conversation/domain/usage";
import { reportUsage } from "./token-usage.ts";

function measure(input: number) {
  const calls: CallUsage[] = [];
  reportUsage(
    {
      inputTokens: input,
      outputTokens: 100,
      totalTokens: input + 100,
      inputTokenDetails: {
        noCacheTokens: input - 600,
        cacheReadTokens: 500,
        cacheWriteTokens: 100,
      },
      outputTokenDetails: { reasoningTokens: 60, textTokens: 40 },
    },
    (usage) => calls.push({ stage: "intent", ...usage }),
  );

  return calls;
}

test("cache reads and writes replace regular input charges, reasoning is included in output", () => {
  const calls = measure(1000);
  assert.equal(calls[0].total, 1100);
  assert.ok(Math.abs(calls[0].estimatedUsd! - 0.0001075) < 1e-12);
  const long = measure(272001);
  assert.ok(
    Math.abs(
      long[0].estimatedUsd! - ((272001 - 600) * 0.2 + 500 * 0.02 + 100 * 0.25 + 100 * 0.75) / 1e6,
    ) < 1e-12,
  );
});

test("setup and scored usage add together and interrupted calls keep totals partial", () => {
  const measured = summarizeCalls(measure(1000), 1);
  const partial = combineUsage([measured, summarizeCalls(measure(1000), 2)]);
  assert.equal(partial.tokens, 2200);
  assert.equal(partial.missingTokens, 1);
  assert.equal(partial.missingCost, 1);
  assert.match(formatUsage(partial), /known tokens/);
  assert.match(formatUsage(summarizeCalls(undefined, 1)), /unavailable/);
});
