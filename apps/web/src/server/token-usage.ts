import type { LanguageModelUsage } from "ai";
import type { UsageObserver } from "@bazak/conversation/domain/usage";

export const modelId = "gpt-6-luna";

// Standard Responses API rates in USD per million tokens, checked 2026-11-24.
// https://developers.openai.com/api/docs/models/gpt-6-luna
export function reportUsage(usage: LanguageModelUsage, observe?: UsageObserver) {
  const input = usage.inputTokens ?? null;
  const output = usage.outputTokens ?? null;
  const cached = usage.inputTokenDetails.cacheReadTokens ?? null;
  const written = usage.inputTokenDetails.cacheWriteTokens ?? null;
  const long = (input ?? 0) > 272000;
  const read = cached ?? 0;
  const write = written ?? 0;

  const estimatedUsd =
    input === null || output === null
      ? null
      : ((input - read - write) * 0.1 * (long ? 2 : 1) +
          read * 0.01 * (long ? 2 : 1) +
          write * 0.125 * (long ? 2 : 1) +
          output * 0.5 * (long ? 1.5 : 1)) /
        1_000_000;

  observe?.({
    model: modelId,
    input,
    output,
    cached,
    written,
    reasoning: usage.outputTokenDetails.reasoningTokens ?? null,
    total: usage.totalTokens ?? null,
    estimatedUsd,
  });
}
