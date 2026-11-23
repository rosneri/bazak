import { bounded } from "#application/deadline";
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
            question: z
              .string()
              .trim()
              .min(1)
              .max(240)
              .describe("Ask about the missing product preference."),
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
  history: HistoryEvidence[];
}

export interface QueryPlanner {
  plan(groups: PlannerInput[], signal: AbortSignal): Promise<PlannerProposal[]>;
}

export type SearchGroup = Extract<IntentDecision, { kind: "discover" }>["searches"][number];

interface GroupPlan {
  hint?: SearchHint;
  question?: string;
}

export async function planGroups(
  groups: SearchGroup[],
  id: string,
  repo: ConversationRepository,
  planner: QueryPlanner,
  metrics: AttemptMetrics,
  signal: AbortSignal,
): Promise<Map<number, GroupPlan>> {
  const inputs: PlannerInput[] = [];
  const plans = new Map<number, GroupPlan>();
  const byCategory = new Map<string, HistoryEvidence[]>();

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
        evidence = [];

        for (const item of prior) {
          const parsed = discoveryCriteriaSchema.safeParse(item.criteria);

          if (parsed.success && parsed.data.category === category)
            evidence.push({ criteria: parsed.data, text: item.text.slice(0, 240) });

          if (evidence.length === 5) break;
        }

        byCategory.set(category, evidence);
      }

      if (evidence.length) inputs.push({ index, criteria: group.criteria, history: evidence });
    } catch {
      metrics.planner[index] = "fallback";
    }
  }

  if (!inputs.length || signal.aborted) return plans;
  metrics.plannerCalls++;

  try {
    const proposals = plannerProposalsSchema.parse(
      await bounded(() => planner.plan(inputs, signal), signal),
    );

    const seen = new Set<number>();

    for (const proposal of proposals) {
      if (seen.has(proposal.index) || !inputs.some((input) => input.index === proposal.index))
        throw new Error("Invalid proposal correlation.");
      seen.add(proposal.index);
    }

    for (const input of inputs) metrics.planner[input.index] = "fallback";

    for (const proposal of proposals) {
      if (proposal.kind === "clarify") {
        plans.set(proposal.index, { question: proposal.question });
        metrics.planner[proposal.index] = "clarification";
      } else {
        plans.set(proposal.index, {
          hint: { keywords: proposal.keywords, priceOrder: proposal.priceOrder },
        });
        metrics.planner[proposal.index] = "used";
      }
    }
  } catch {
    for (const input of inputs) metrics.planner[input.index] = "fallback";
  }

  return plans;
}
