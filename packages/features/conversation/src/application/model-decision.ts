import { z } from "zod";
import {
  intentDecisionSchema,
  searchKeywordsSchema,
  type DiscoveryCriteria,
  type IntentDecision,
} from "@bazak/product-discovery/domain/discovery";

const questions = {
  product: "What kind of product are you looking for?",
  gift: "Who are you shopping for, and what do they like?",
  preference: "Which type, feature, or style should I look for?",
  limits: "Which three product groups should I search? I can show up to ten items per group.",
} as const;

const reason = z
  .enum(["product", "gift", "preference", "limits"])
  .describe("Which missing shopping detail or request limit requires clarification.");

const [discover, clarify, offCatalog, detail, cheaper, retry] = intentDecisionSchema.options;

const [search] = discover.shape.searches.element.options;

export const maxContextTurns = 8;

export const maxGroups = 3;

const modelGroupSchema = z
  .discriminatedUnion("kind", [
    search.omit({ label: true }).describe("One bounded catalog search proposal."),
    clarify
      .omit({ question: true })
      .extend({ reason })
      .describe("A group that needs a shopping clarification."),
    offCatalog,
  ])
  .describe("One proposed action for an individual request.");

export const modelDecisionSchema = z
  .discriminatedUnion("kind", [
    discover
      .extend({
        searches: z
          .array(modelGroupSchema)
          .min(1)
          .max(maxGroups)
          .describe("Up to three proposed groups."),
      })
      .describe("Proposed groups in shopper order."),
    clarify
      .omit({ question: true })
      .extend({ reason })
      .describe("A shopping request needing clarification."),
    offCatalog,
    detail,
    cheaper,
    retry
      .omit({ label: true })
      .extend({
        group: z
          .int()
          .nonnegative()
          .max(maxContextTurns * maxGroups - 1)
          .describe("A retry group reference supplied in recent history."),
      })
      .describe("Retry a failed lookup exposed in the current context."),
  ])
  .describe("The intent model's proposal before application checks.");

export type ModelDecision = z.infer<typeof modelDecisionSchema>;

type RetryProposal = Extract<ModelDecision, { kind: "retry-group" }>;

const normalize = (text: string) =>
  text.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();

const wordsOf = (text: string) =>
  text.match(/[\p{L}\p{M}\p{N}]+(?:[.&'’-][\p{L}\p{M}\p{N}]+)*/gu) ?? [];

export function groundedKeywords(keywords: string, text: string): string | undefined {
  const normalized = normalize(keywords);
  const terms = searchKeywordsSchema.safeParse(normalized);

  if (!terms.success || !/^[\p{L}\p{M}\p{N}]+(?:[ .&'’-]+[\p{L}\p{M}\p{N}]+)*$/u.test(normalized))
    return;
  const proposed = wordsOf(normalized);
  const words = wordsOf(normalize(text));

  if (proposed.length > 6) return;

  if (
    words.some((_, index) =>
      proposed.every((word, offset) => {
        const actual = words[index + offset];

        return (
          actual &&
          (word === actual ||
            word + "s" === actual ||
            word + "es" === actual ||
            actual + "s" === word ||
            actual + "es" === word)
        );
      }),
    )
  )
    return terms.data;
}

export function searchLabel(criteria: DiscoveryCriteria) {
  const name = criteria.keywords ?? criteria.category?.replaceAll("-", " ") ?? "products";

  return name[0].toUpperCase() + name.slice(1, 80);
}

export function authorizeDecision(
  proposal: ModelDecision,
  text: string,
): Exclude<IntentDecision, { kind: "retry-group" }> | RetryProposal {
  if (proposal.kind === "clarify") return { kind: "clarify", question: questions[proposal.reason] };

  if (proposal.kind !== "discover") return proposal;

  return {
    kind: "discover",
    searches: proposal.searches.map((group) => {
      if (group.kind === "off-catalog") return { ...group, label: "Outside the catalog" };

      if (group.kind === "clarify")
        return {
          kind: "clarify",
          label: group.reason === "gift" ? "Gift" : "Product search",
          question: questions[group.reason],
        };

      const { keywords, ...constraints } = group.criteria;
      const grounded = keywords && groundedKeywords(keywords, text);

      if (!grounded && !constraints.category)
        return { kind: "clarify", label: "Product search", question: questions.product };
      const criteria = grounded ? { ...constraints, keywords: grounded } : constraints;

      return { ...group, criteria, label: searchLabel(criteria) };
    }),
  };
}
