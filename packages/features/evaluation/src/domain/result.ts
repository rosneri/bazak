import {
  usageSummarySchema,
  combineUsage,
  formatUsage,
  summarizeCalls,
} from "@bazak/conversation/domain/usage";
import { z } from "zod";
import { storedMetricsSchema, groupSchema } from "@bazak/conversation/domain/turn";
import { intentDecisionSchema } from "@bazak/product-discovery/domain/discovery";
import { caseSchema } from "@bazak/evaluations/cases";

const duration = z.int32().nonnegative().describe("Elapsed milliseconds.");

const check = z
  .boolean()
  .nullable()
  .describe("True for a satisfied check, false for a disagreement, null when unscored.");

export const profileSchema = z
  .enum(["fixture", "production"])
  .describe("Which service composition executed the labeled prompt.");

export const observationSchema = z
  .strictObject({
    decision: intentDecisionSchema
      .nullable()
      .describe("Validated intent recorded for the final turn, when available."),
    caseUsage: usageSummarySchema
      .optional()
      .describe("Usage across setup and scored turns for this case."),
    groups: z
      .array(groupSchema)
      .describe("Observed committed product groups in presentation order."),
    metrics: storedMetricsSchema
      .nullable()
      .describe("Recorded call counts, attempted queries and timings, when available."),
  })
  .describe("Actual service evidence used to score the case.");

export const evaluationResultSchema = z
  .strictObject({
    id: z.uuid().describe("Stable, immutable identifier for this observation."),
    runId: z.uuid().describe("Identity shared by all cases executed in one run."),
    profile: profileSchema,
    caseName: z.string().trim().min(1).max(200).describe("Label displayed in evaluation history."),
    recordedAt: z.iso.datetime().describe("UTC instant when scoring finished."),
    outcome: z
      .enum(["observed", "execution-error"])
      .describe("Whether semantic evidence was available or execution failed."),
    expected: caseSchema.describe("Independent label with expected intent and product evidence."),
    actual: observationSchema,
    intentMatch: check.describe("Whether observed and labeled intent agree."),
    constraintsSatisfied: check.describe(
      "Whether returned groups meet the labeled product and query constraints.",
    ),
    correctAbstention: check.describe(
      "Whether a labeled abstention returned its expected intent with zero catalog calls.",
    ),
    firstOutputMs: duration
      .nullable()
      .describe("Time until first server-emitted shopper content, or null if none was observed."),
    durationMs: duration.describe("Total elapsed time for the scored turn."),
    detail: z
      .string()
      .trim()
      .max(2000)
      .nullable()
      .default(null)
      .describe("A safe diagnostic for a case that could not execute."),
  })
  .refine((result) => {
    const scores = [result.intentMatch, result.constraintsSatisfied, result.correctAbstention];

    return result.outcome === "execution-error"
      ? scores.every((score) => score === null)
      : scores.some((score) => score !== null);
  }, "Execution errors carry no semantic grades. Completed cases need an applicable score.")
  .refine((result) => result.firstOutputMs === null || result.firstOutputMs <= result.durationMs, {
    path: ["firstOutputMs"],
    message: "First output cannot occur after the turn ends.",
  })
  .describe("One immutable labeled case result.");

export type EvaluationResult = z.infer<typeof evaluationResultSchema>;

export type Observation = z.infer<typeof observationSchema>;

export type Profile = z.infer<typeof profileSchema>;

export const evaluationBatchSchema = z
  .array(evaluationResultSchema)
  .min(1)
  .max(500)
  .refine(
    (results) => new Set(results.map((result) => result.id.toLowerCase())).size === results.length,
    "Each result in a batch needs a distinct ID.",
  )
  .describe("An atomic import of at most 500 distinct observations.");

export function evaluationPassed(result: EvaluationResult) {
  return (
    result.outcome === "observed" &&
    ![result.intentMatch, result.constraintsSatisfied, result.correctAbstention].includes(false)
  );
}

export type MetricName = "intentMatch" | "constraintsSatisfied" | "correctAbstention";

export function metricCount(results: EvaluationResult[], metric: MetricName) {
  let passed = 0;
  let scored = 0;

  for (const result of results) {
    if (result[metric] === null) continue;
    scored++;

    if (result[metric]) passed++;
  }

  return { passed, scored };
}

export function evaluationUsage(rows: EvaluationResult[]) {
  const summaries = rows.map(
    (row) => row.actual.caseUsage ?? summarizeCalls([], row.profile === "fixture" ? 0 : 1),
  );

  return formatUsage(combineUsage(summaries));
}
