import { modelDecisionSchema } from "@bazak/conversation/application/chat";
import { z } from "zod";

const label = z.string().trim().min(1).describe("A nonempty review label.");

const productGroupLabelSchema = z
  .strictObject({
    category: label.nullable().describe("Expected product category, or null for a guidance group."),
    guidance: z
      .enum(["clarify", "off-catalog"])
      .optional()
      .describe("Expected guidance for one non-search group."),
    count: z.int().min(0).max(10).describe("Exact expected number of visible matching products."),
    ids: z
      .array(label)
      .optional()
      .describe("Independently acceptable fixture catalog identifiers."),
    relevanceTerms: z
      .array(label)
      .optional()
      .describe(
        "Any matching term in a live product's title or description establishes relevance.",
      ),
    under: z.number().nonnegative().optional().describe("Strict price ceiling, in dollars."),
    order: z
      .enum(["ascending", "descending"])
      .optional()
      .describe("Price direction the shopper requested."),
    firstId: label
      .optional()
      .describe("Expected first result when the ranking has a specific winner."),
  })
  .refine(
    (group) =>
      group.guidance ? group.category === null && group.count === 0 : group.category !== null,
    "Guidance groups have no category or products.",
  )
  .describe("Independent relevance, stock, count, budget and ordering labels for a result group.");

export const caseSchema = z
  .strictObject({
    name: label.describe("Reviewer-facing case name."),
    prompt: label.describe("Final user message sent to the service."),
    conversation: label
      .optional()
      .describe("Ordered scenario whose turns share one conversation in this run."),
    priorChat: label
      .optional()
      .describe("Optional evidence seeded through the service in a different conversation."),
    priorTurn: label.optional().describe("Optional earlier user message in the same conversation."),
    intent: z
      .enum(["discover", "clarify", "off-catalog", "detail"])
      .describe("Independently assigned expected intent."),
    proposal: modelDecisionSchema
      .optional()
      .describe("Labeled raw intent proposal, before application routing."),
    failFirstLookup: z
      .literal(true)
      .optional()
      .describe("Fail the first fixture catalog page to seed a retryable group."),
    groups: z
      .array(productGroupLabelSchema)
      .describe("Expected result groups in original request order."),
    plannerCalls: z
      .int()
      .min(0)
      .max(1)
      .describe("Number of planner operations allowed by this labeled case."),
    queryTerm: label
      .optional()
      .describe(
        "Keyword expected in the actual recorded page query when history informs planning.",
      ),
  })
  .describe("An independently labeled shopping prompt with isolated setup.");

export type EvaluationCase = z.infer<typeof caseSchema>;

const fragrances = ["f-rose", "f-cedar", "f-citrus", "f-amber"];

const budgetPrompt = "Show me two fragrances under $50.";

const broadPrompt = "Show me a few fragrances.";

const broadGroup = { category: "fragrances", count: 3, ids: fragrances };

export const fixtureCases: EvaluationCase[] = [
  {
    name: "Clear product search",
    prompt: "Show me two fragrances.",
    intent: "discover",
    groups: [{ category: "fragrances", count: 2, ids: fragrances }],
    plannerCalls: 0,
  },
  {
    name: "Strict budget",
    prompt: budgetPrompt,
    intent: "discover",
    groups: [{ category: "fragrances", count: 2, ids: fragrances, under: 50 }],
    plannerCalls: 0,
  },
  {
    name: "Exclusive price boundary",
    prompt: "Show me a fragrance under $18.",
    intent: "discover",
    groups: [{ category: "fragrances", count: 0, under: 18 }],
    plannerCalls: 0,
  },
  {
    name: "Cheaper follow-up",
    priorTurn: budgetPrompt,
    prompt: "Show me a cheaper one.",
    intent: "discover",
    groups: [
      { category: "fragrances", count: 1, ids: ["f-citrus"], under: 34, order: "ascending" },
    ],
    plannerCalls: 0,
  },
  {
    name: "Relevant earlier chat",
    priorChat: "Show me two light fragrances under $50.",
    prompt: broadPrompt,
    intent: "discover",
    groups: [{ ...broadGroup, firstId: "f-citrus" }],
    plannerCalls: 1,
    queryTerm: "light",
  },
  {
    name: "No earlier history",
    prompt: broadPrompt,
    intent: "discover",
    groups: [broadGroup],
    plannerCalls: 0,
  },
  {
    name: "Vague shopping request",
    prompt: "Something cheap and cool.",
    intent: "clarify",
    groups: [],
    plannerCalls: 0,
  },
  {
    name: "Outside the catalog",
    prompt: "What is the weather tomorrow?",
    intent: "off-catalog",
    groups: [],
    plannerCalls: 0,
  },
  {
    name: "Independent product groups",
    prompt: "Show me two fragrances under $50 and one lamp under $40.",
    intent: "discover",
    groups: [
      { category: "fragrances", count: 2, ids: fragrances, under: 50 },
      { category: "home-decoration", count: 1, ids: ["l-desk"], under: 40 },
    ],
    plannerCalls: 0,
  },
];

export const liveCases: EvaluationCase[] = [
  {
    name: "Live fragrance search",
    prompt: "Show me one fragrance under $150.",
    intent: "discover",
    groups: [
      {
        category: "fragrances",
        count: 1,
        under: 150,
        relevanceTerms: ["perfume", "fragrance", "eau de", "scent"],
      },
    ],
    plannerCalls: 0,
  },
  {
    name: "Live off-catalog request",
    prompt: "What is the weather tomorrow?",
    intent: "off-catalog",
    groups: [],
    plannerCalls: 0,
  },
];
