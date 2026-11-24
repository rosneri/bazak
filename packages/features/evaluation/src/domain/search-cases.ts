import type { ModelDecision } from "@bazak/conversation/application/chat";
import {
  categorySlugSchema,
  type DiscoveryCriteria,
} from "@bazak/product-discovery/domain/discovery";
import type { EvaluationCase } from "./cases.ts";

const category = "fragrances";

const priorTurn = "Show me two fragrances under $50.";

const all = ["f-rose", "f-cedar", "f-citrus", "f-amber"];

function search(criteria: DiscoveryCriteria, readiness: "ready" | "needs-planning" = "ready") {
  return { kind: "search", criteria, readiness } as const;
}

function labeled(
  name: string,
  prompt: string,
  proposal: ModelDecision,
  groups: EvaluationCase["groups"],
  extra: Partial<EvaluationCase> = {},
): EvaluationCase {
  return { name, prompt, proposal, intent: "discover", groups, plannerCalls: 0, ...extra };
}

function lookup(
  name: string,
  prompt: string,
  criteria: DiscoveryCriteria,
  ids: string[],
  order?: "ascending" | "descending",
) {
  return labeled(name, prompt, { kind: "discover", searches: [search(criteria)] }, [
    { category, count: ids.length, ids, ...(order && { order }) },
  ]);
}

const prices: EvaluationCase[] = [
  lookup(
    "Strict lower bound",
    "Show me fragrances above $42.",
    { category, minPrice: 42, minPriceBoundary: "exclusive" },
    ["f-amber"],
  ),
  lookup(
    "Inclusive lower bound",
    "Show me fragrances at least $42.",
    { category, minPrice: 42, minPriceBoundary: "inclusive" },
    ["f-cedar", "f-amber"],
  ),
  lookup(
    "Strict upper bound",
    "Show me fragrances under $34.",
    { category, maxPrice: 34, priceBoundary: "exclusive" },
    ["f-citrus"],
  ),
  lookup(
    "Inclusive upper bound",
    "Show me fragrances up to $34.",
    { category, maxPrice: 34, priceBoundary: "inclusive" },
    ["f-citrus", "f-rose"],
  ),
  lookup(
    "Bounded price range",
    "Show me fragrances above $18 and up to $42.",
    {
      category,
      minPrice: 18,
      minPriceBoundary: "exclusive",
      maxPrice: 42,
      priceBoundary: "inclusive",
    },
    ["f-rose", "f-cedar"],
  ),
  lookup(
    "Lowest price first",
    "Show the two cheapest fragrances.",
    { category, count: 2, priceOrder: "ascending" },
    ["f-citrus", "f-rose"],
    "ascending",
  ),
  lookup(
    "Highest price first",
    "Show the two most expensive fragrances.",
    { category, count: 2, priceOrder: "descending" },
    ["f-amber", "f-cedar"],
    "descending",
  ),
];

const targets: EvaluationCase[] = [
  lookup("Category and count", "Show me two fragrances.", { category, count: 2 }, [
    "f-rose",
    "f-cedar",
  ]),
  lookup(
    "Keyword only",
    "Find one product matching the exact term cedar across all categories.",
    { keywords: "cedar", count: 1 },
    ["f-cedar"],
  ),
  lookup(
    "Category and keyword",
    "Show me one light fragrance.",
    { category, keywords: "light", count: 1 },
    ["f-citrus"],
  ),
  lookup(
    "Exhaustive empty result",
    "Show fragrances below $18.",
    { category, maxPrice: 18, priceBoundary: "exclusive" },
    [],
  ),
  labeled(
    "Independent search groups",
    "Show me one fragrance and one lamp.",
    {
      kind: "discover",
      searches: [
        search({ category, count: 1 }),
        search({ category: "home-decoration", keywords: "lamp", count: 1 }),
      ],
    },
    [
      { category, count: 1, ids: ["f-rose"] },
      { category: "home-decoration", count: 1, ids: ["l-desk"] },
    ],
  ),
  labeled(
    "Broad category with history",
    "Show me a few fragrances.",
    { kind: "discover", searches: [search({ category }, "needs-planning")] },
    [{ category, count: 3, ids: all, firstId: "f-citrus" }],
    { priorChat: "Show me two light fragrances under $50.", plannerCalls: 1, queryTerm: "light" },
  ),
];

const followups: EvaluationCase[] = [
  labeled(
    "Cheaper alternative",
    "Show me a cheaper one.",
    { kind: "cheaper", productId: null },
    [{ category, count: 1, ids: ["f-citrus"] }],
    { priorTurn },
  ),
  labeled(
    "Named cheaper alternative",
    "Show me a cheaper alternative to Cedar Wood.",
    { kind: "cheaper", productId: "f-cedar" },
    [{ category, count: 1, ids: ["f-citrus"] }],
    { priorTurn },
  ),
  labeled(
    "Replace price floor",
    "Now above $42.",
    { kind: "replace-price", side: "minimum", amount: 42, boundary: "exclusive" },
    [{ category, count: 1, ids: ["f-amber"] }],
    { priorTurn },
  ),
  labeled(
    "Replace price ceiling",
    "Now up to $18.",
    { kind: "replace-price", side: "maximum", amount: 18, boundary: "inclusive" },
    [{ category, count: 1, ids: ["f-citrus"] }],
    { priorTurn },
  ),
  labeled(
    "Refresh visible product",
    "Is Cedar Wood in stock?",
    { kind: "detail", productId: "f-cedar" },
    [{ category, count: 1, ids: ["f-cedar"] }],
    { priorTurn, intent: "detail" },
  ),
  labeled(
    "Retry failed group",
    "Retry the fragrances lookup.",
    { kind: "retry-group", group: 0 },
    [{ category, count: 2, ids: all.filter((id) => id !== "f-amber"), under: 50 }],
    { priorTurn, failFirstLookup: true },
  ),
  labeled(
    "Clarify missing target",
    "Find something for me.",
    { kind: "clarify", reason: "product" },
    [],
    { intent: "clarify" },
  ),
  labeled("Off-catalog request", "What is the weather tomorrow?", { kind: "off-catalog" }, [], {
    intent: "off-catalog",
  }),
];

function conversation(name: string, turns: EvaluationCase[]) {
  return turns.map((turn, index) => ({
    ...turn,
    conversation: name,
    name: name + " · " + (index + 1) + ". " + turn.name,
  }));
}

const refineThenInspect = conversation("Refine and inspect", [
  lookup(
    "Find two fragrances",
    priorTurn,
    { category, count: 2, maxPrice: 50, priceBoundary: "exclusive" },
    ["f-rose", "f-cedar"],
  ),
  labeled(
    "Lower the ceiling",
    "Now up to $18.",
    { kind: "replace-price", side: "maximum", amount: 18, boundary: "inclusive" },
    [{ category, count: 1, ids: ["f-citrus"] }],
  ),
  labeled(
    "Check the result",
    "Is that one in stock?",
    { kind: "detail", productId: "f-citrus" },
    [{ category, count: 1, ids: ["f-citrus"] }],
    { intent: "detail" },
  ),
]);

const changeTarget = conversation("Change product groups", [
  labeled(
    "Clarify the target",
    "Find something for me.",
    { kind: "clarify", reason: "product" },
    [],
    { intent: "clarify" },
  ),
  lookup("Choose fragrances", "Show me two fragrances.", { category, count: 2 }, [
    "f-rose",
    "f-cedar",
  ]),
  labeled(
    "Switch to lamps",
    "Show me one desk lamp.",
    {
      kind: "discover",
      searches: [search({ category: "home-decoration", keywords: "desk lamp", count: 1 })],
    },
    [{ category: "home-decoration", count: 1, ids: ["l-desk"] }],
  ),
  labeled(
    "Refer back to Cedar Wood",
    "What is the current price of Cedar Wood?",
    { kind: "detail", productId: "f-cedar" },
    [{ category, count: 1, ids: ["f-cedar"] }],
    { intent: "detail" },
  ),
]);

const categories = categorySlugSchema.options.map((slug) => {
  const ids = slug === "fragrances" ? ["f-rose"] : slug === "home-decoration" ? ["l-desk"] : [];

  return labeled(
    "Category routing · " + slug,
    "Show me one item from the " + slug + " category.",
    {
      kind: "discover",
      searches: [search({ category: slug, count: 1 })],
    },
    [{ category: slug, count: ids.length, ids }],
  );
});

const mixed = labeled(
  "Search, clarify and decline in one turn",
  "Show one fragrance, find a gift for someone, and book me a flight.",
  {
    kind: "discover",
    searches: [
      search({ category, count: 1 }),
      { kind: "clarify", reason: "gift" },
      { kind: "off-catalog" },
    ],
  },
  [
    { category, count: 1, ids: ["f-rose"] },
    { category: null, count: 0, guidance: "clarify" },
    { category: null, count: 0, guidance: "off-catalog" },
  ],
);

export const searchCases = [
  ...categories,
  mixed,
  ...targets,
  ...prices,
  ...followups,
  ...refineThenInspect,
  ...changeTarget,
];

export const harnessCases = [
  ...searchCases,
  labeled(
    "Reject an unseen detail reference",
    "Is that in stock?",
    { kind: "detail", productId: "unseen" },
    [],
    { intent: "clarify" },
  ),
  labeled(
    "Reject a retry without a failed group",
    "Try that again.",
    { kind: "retry-group", group: 0 },
    [],
    { priorTurn, intent: "clarify" },
  ),
];
