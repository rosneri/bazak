import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { fixtureCases } from "@bazak/evaluations/cases";
import {
  evaluationBatchSchema,
  evaluationPassed,
  evaluationResultSchema,
  metricCount,
} from "@bazak/evaluations";

const sample = {
  id: randomUUID(),
  runId: randomUUID(),
  caseName: "Outside catalog",
  profile: "fixture",
  recordedAt: "2026-11-23T12:41:33.000Z",
  outcome: "observed",
  expected: fixtureCases[7],
  actual: { decision: { kind: "off-catalog" }, groups: [], metrics: null },
  intentMatch: true,
  constraintsSatisfied: null,
  correctAbstention: true,
  firstOutputMs: null,
  durationMs: 18,
};

test("an absent first output is retained and unscored constraints have no denominator", () => {
  const row = evaluationResultSchema.parse(sample);
  assert.equal(evaluationPassed(row), true);
  assert.equal(row.firstOutputMs, null);
  assert.deepEqual(metricCount([row], "constraintsSatisfied"), { passed: 0, scored: 0 });
  assert.deepEqual(metricCount([row], "correctAbstention"), { passed: 1, scored: 1 });
});

test("execution errors stay distinct from disagreements", () => {
  const row = evaluationResultSchema.parse({
    ...sample,
    outcome: "execution-error",
    intentMatch: null,
    correctAbstention: null,
  });

  assert.equal(evaluationPassed(row), false);
  assert.deepEqual(metricCount([row], "intentMatch"), { passed: 0, scored: 0 });
  assert.equal(evaluationResultSchema.safeParse({ ...row, intentMatch: false }).success, false);
});

test("repeated IDs and malformed rows invalidate an entire import", () => {
  assert.equal(
    evaluationBatchSchema.safeParse([sample, { ...sample, id: sample.id.toUpperCase() }]).success,
    false,
  );
  assert.equal(
    evaluationBatchSchema.safeParse([sample, { ...sample, id: randomUUID(), firstOutputMs: 19 }])
      .success,
    false,
  );
  assert.equal(
    evaluationBatchSchema.safeParse([{ ...sample, intentMatch: null, correctAbstention: null }])
      .success,
    false,
  );
});
