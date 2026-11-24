import type { UsageObserver } from "@bazak/conversation/domain/usage";
import { recordInput, type PromptObserver } from "#application/step-input";
import { bounded } from "#application/deadline";
import { groundedKeywords } from "#application/model-decision";
import { z } from "zod";
import { searchHintSchema, type SearchHint } from "@bazak/product-discovery/application/discovery";
import {
  discoveryCriteriaSchema,
  type DiscoveryCriteria,
  type IntentDecision,
} from "@bazak/product-discovery/domain/discovery";
import type { AttemptMetrics } from "@bazak/conversation/domain/turn";
import type {
  ConversationRepository,
  HistoryEvidence,
} from "@bazak/conversation/application/repository";

export const historyCriteriaSchema = z
  .array(discoveryCriteriaSchema)
  .min(1)
  .max(3)
  .describe("All successful search criteria for one category in one earlier turn, in group order.");

const groupIndex = z.int().min(0).max(2).describe("Original zero-based group index.");

export const plannerProposalsSchema = z
  .array(
    z
      .discriminatedUnion("kind", [
        searchHintSchema
          .extend({
            kind: z.literal("hint").describe("Use soft ranking or keyword preferences."),
            index: groupIndex,
          })
          .describe("Soft preferences for the selected group."),
        z
          .strictObject({
            kind: z.literal("clarify").describe("Ask before searching this group."),
            index: groupIndex,
          })
          .describe("Clarification for this group alone."),
      ])
      .describe("One query planner proposal."),
  )
  .max(3)
  .describe("Proposals for eligible groups in this attempt.");

export type PlannerProposal = z.infer<typeof plannerProposalsSchema>[number];

export interface PlannerInput {
  index: number;
  criteria: DiscoveryCriteria;
  history: Pick<DiscoveryCriteria, "keywords" | "maxPrice" | "priceOrder">[];
}

export interface QueryPlanner {
  plan(
    groups: PlannerInput[],
    signal: AbortSignal,
    observe?: PromptObserver,
    usage?: UsageObserver,
  ): Promise<PlannerProposal[]>;
}

export type SearchGroup = Extract<IntentDecision, { kind: "discover" }>["searches"][number];

export interface GroupPlan {
  hint?: SearchHint;
  question?: string;
}

function extractCategoryEvidence(
  prior: HistoryEvidence[],
  category: string,
): PlannerInput["history"] {
  const evidence: PlannerInput["history"] = [];

  for (const item of prior.slice(0, 5)) {
    const parsed = historyCriteriaSchema.safeParse(item.criteria);

    if (!parsed.success || !parsed.data.every((criteria) => criteria.category === category))
      continue;

    for (const { keywords, maxPrice, priceOrder } of parsed.data) {
      const grounded = keywords && groundedKeywords(keywords, item.text);
      evidence.push({ keywords: grounded || undefined, maxPrice, priceOrder });
    }
  }

  return evidence;
}

async function collectPlannerInputs(
  groups: SearchGroup[],
  id: string,
  repo: ConversationRepository,
  metrics: AttemptMetrics,
  signal: AbortSignal,
) {
  const inputs: PlannerInput[] = [];
  const byCategory = new Map<string, PlannerInput["history"]>();

  for (const [index, group] of groups.entries()) {
    metrics.planner[index] = "skipped";

    if (group.kind !== "search" || group.readiness === "ready" || !group.criteria.category)
      continue;

    try {
      const category = group.criteria.category;
      let evidence = byCategory.get(category);

      if (!evidence) {
        // Repeated categories share their history within this batch.
        // oxlint-disable-next-line no-await-in-loop
        const prior = await bounded(() => repo.relevantHistory(id, category), signal);
        evidence = extractCategoryEvidence(prior, category);
        byCategory.set(category, evidence);
      }

      if (evidence.length) inputs.push({ index, criteria: group.criteria, history: evidence });
    } catch {
      metrics.planner[index] = "fallback";
    }
  }

  return inputs;
}

function validateProposalIndices(proposals: PlannerProposal[], inputs: PlannerInput[]) {
  const seen = new Set<number>();

  for (const proposal of proposals) {
    if (seen.has(proposal.index) || !inputs.some((input) => input.index === proposal.index))
      throw new Error("Invalid proposal correlation.");
    seen.add(proposal.index);
  }
}

function applyPlannerProposals(
  proposals: PlannerProposal[],
  inputs: PlannerInput[],
  metrics: AttemptMetrics,
  plans: Map<number, GroupPlan>,
) {
  for (const proposal of proposals) {
    const input = inputs.find((candidate) => candidate.index === proposal.index);

    if (proposal.kind === "clarify") {
      const category = input?.criteria.category;

      const question =
        category === "fragrances"
          ? "Which fragrance notes do you prefer?"
          : "Which type, feature, or style should I look for?";

      plans.set(proposal.index, { question });
      metrics.planner[proposal.index] = "clarification";
    } else {
      const evidence = input?.history ?? [];
      const keywords = proposal.keywords;

      const grounded = keywords
        ? evidence
            .map((item) => item.keywords && groundedKeywords(keywords, item.keywords))
            .find(Boolean)
        : null;

      if (keywords && !grounded) continue;

      plans.set(proposal.index, {
        hint: { keywords: grounded || null, priceOrder: proposal.priceOrder },
      });
      metrics.planner[proposal.index] = "used";
    }
  }
}

export async function planGroups(
  groups: SearchGroup[],
  id: string,
  repo: ConversationRepository,
  planner: QueryPlanner,
  metrics: AttemptMetrics,
  signal: AbortSignal,
): Promise<Map<number, GroupPlan>> {
  recordInput(metrics, "planner", "Requested groups", groups);
  const plans = new Map<number, GroupPlan>();
  const inputs = await collectPlannerInputs(groups, id, repo, metrics, signal);

  if (!inputs.length || signal.aborted) return plans;
  metrics.plannerCalls++;
  recordInput(metrics, "planner", "Planner model input", inputs);

  try {
    const proposals = plannerProposalsSchema.parse(
      await bounded(
        () =>
          planner.plan(
            inputs,
            signal,
            (prompt) => recordInput(metrics, "planner", "Provider prompt", prompt),
            (usage) => metrics.usage?.push({ stage: "planner", ...usage }),
          ),
        signal,
      ),
    );

    validateProposalIndices(proposals, inputs);

    for (const input of inputs) metrics.planner[input.index] = "fallback";

    applyPlannerProposals(proposals, inputs, metrics, plans);
  } catch {
    for (const input of inputs) metrics.planner[input.index] = "fallback";
  }

  return plans;
}
