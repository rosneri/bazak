import type { ModelInput, ModelDecision } from "#application/chat";
import type { PlannerInput, SearchGroup } from "#application/query-planner";
import type { routingHistory } from "#application/resolve-references";
import type { DiscoveryCriteria } from "@bazak/product-discovery/domain/discovery";
import type { SearchHint } from "@bazak/product-discovery/application/discovery";
import type { AttemptMetrics } from "@bazak/conversation/domain/turn";

type RecordedInput = NonNullable<AttemptMetrics["stepInputs"]>[number];

type ProviderPrompt = { system?: string; prompt: string };

export type PromptObserver = (messages: ProviderPrompt) => void;

interface StageInput {
  intent: ModelInput | ProviderPrompt;
  decision: { proposal: ModelDecision; text: string; history: ReturnType<typeof routingHistory> };
  planner: SearchGroup[] | PlannerInput[] | ProviderPrompt;
  catalog:
    | { label: string; criteria: DiscoveryCriteria; hint?: SearchHint }
    | { productId: string };
}

export function recordInput<Stage extends RecordedInput["stage"]>(
  metrics: AttemptMetrics,
  stage: Stage,
  name: string,
  input: StageInput[Stage],
) {
  metrics.stepInputs?.push({ stage, name, value: JSON.stringify(input, null, 2) });
}
