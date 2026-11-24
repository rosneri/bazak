import { z } from "zod";

const tokenCount = z
  .int()
  .nonnegative()
  .nullable()
  .describe("Provider-reported token count when available.");

export const callUsageSchema = z
  .strictObject({
    stage: z
      .enum(["intent", "planner", "reply"])
      .describe("Model operation responsible for the call."),
    model: z.string().min(1).describe("Model identifier or local fixture."),
    input: tokenCount.describe("Total input tokens, including cached input."),
    output: tokenCount.describe("Total output tokens, including reasoning."),
    cached: tokenCount.describe("Input tokens read from cache."),
    written: tokenCount.describe("Input tokens written to cache."),
    reasoning: tokenCount.describe("Reasoning tokens included in output."),
    total: tokenCount.describe("Combined provider input and output tokens."),
    estimatedUsd: z
      .number()
      .nonnegative()
      .nullable()
      .describe("Estimated standard USD cost at execution-time rates."),
  })
  .describe("Provider token usage and estimated price for one model call.");

export type CallUsage = z.infer<typeof callUsageSchema>;

export type UsageObserver = (usage: Omit<CallUsage, "stage">) => void;

export const usageSummarySchema = z
  .strictObject({
    tokens: z.int().nonnegative().describe("Sum of available token totals."),
    usd: z.number().nonnegative().describe("Sum of available estimated USD charges."),
    missingTokens: z.int().nonnegative().describe("Number of measurements missing token totals."),
    missingCost: z.int().nonnegative().describe("Number of measurements missing estimated cost."),
  })
  .describe("Known token and cost subtotals with explicit coverage gaps.");

export type UsageSummary = z.infer<typeof usageSummarySchema>;

export function summarizeCalls(records: CallUsage[] | undefined, expected: number): UsageSummary {
  const calls = records ?? [];
  const missing = Math.max(0, expected - calls.length);

  return {
    tokens: calls.reduce((sum, call) => sum + (call.total ?? 0), 0),
    usd: calls.reduce((sum, call) => sum + (call.estimatedUsd ?? 0), 0),
    missingTokens: missing + calls.filter((call) => call.total === null).length,
    missingCost: missing + calls.filter((call) => call.estimatedUsd === null).length,
  };
}

export function combineUsage(values: UsageSummary[]) {
  return values.reduce(
    (a, b) => ({
      tokens: a.tokens + b.tokens,
      usd: a.usd + b.usd,
      missingTokens: a.missingTokens + b.missingTokens,
      missingCost: a.missingCost + b.missingCost,
    }),
    summarizeCalls([], 0),
  );
}

export function formatUsage(value: UsageSummary) {
  const cost = value.usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 9,
  });

  const tokens = value.missingTokens
    ? value.tokens
      ? value.tokens + " known tokens"
      : "Token count unavailable"
    : value.tokens + " tokens";

  const charge = value.missingCost
    ? value.usd
      ? cost + " known estimate"
      : "Cost unavailable"
    : cost + " estimated";

  return tokens + " · " + charge;
}

export function attemptUsage(
  metrics: {
    usage?: CallUsage[];
    intentCalls: number;
    plannerCalls: number;
    replyCalls: number;
  } | null,
) {
  return metrics
    ? summarizeCalls(metrics.usage, metrics.intentCalls + metrics.plannerCalls + metrics.replyCalls)
    : summarizeCalls([], 1);
}
