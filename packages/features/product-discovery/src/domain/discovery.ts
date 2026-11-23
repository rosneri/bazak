import { z } from "zod";

export const categorySlugSchema = z
  .enum([
    "beauty",
    "fragrances",
    "furniture",
    "groceries",
    "home-decoration",
    "kitchen-accessories",
    "laptops",
    "mens-shirts",
    "mens-shoes",
    "mens-watches",
    "mobile-accessories",
    "motorcycle",
    "skin-care",
    "smartphones",
    "sports-accessories",
    "sunglasses",
    "tablets",
    "tops",
    "vehicle",
    "womens-bags",
    "womens-dresses",
    "womens-jewellery",
    "womens-shoes",
    "womens-watches",
  ])
  .describe("An allowed DummyJSON catalog category.");

export const searchKeywordsSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .describe("Words identifying the requested product.");

export const priceOrderSchema = z
  .enum(["ascending", "descending"])
  .describe("The price sort direction.");

export const discoveryCriteriaSchema = z
  .strictObject({
    category: categorySlugSchema.optional().describe("Restrict the lookup to this category."),
    keywords: searchKeywordsSchema.optional().describe("Terms the requested product must match."),
    maxPrice: z.number().nonnegative().optional().describe("Per-item dollar ceiling."),
    priceBoundary: z
      .enum(["exclusive", "inclusive"])
      .optional()
      .describe("Under is exclusive. Up to is inclusive by default."),
    priceOrder: priceOrderSchema
      .optional()
      .describe("Explicit price ordering requested by the shopper."),
    count: z
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe("Requested number of cards, from one to ten."),
  })
  .refine((c) => Boolean(c.category || c.keywords), "A product target is required.")
  .describe("Explicit constraints for one product search.");

export type DiscoveryCriteria = z.infer<typeof discoveryCriteriaSchema>;

const label = z.string().trim().min(1).max(80).describe("A short product group name.");

const question = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .describe("A question asking for the missing shopping detail.");

const productId = z.string().min(1).max(80).describe("A previously displayed product ID.");

const search = z
  .strictObject({
    kind: z.literal("search").describe("Search the catalog for this group."),
    label,
    criteria: discoveryCriteriaSchema,
    readiness: z
      .enum(["ready", "needs-planning"])
      .describe(
        "Ready for explicit and resolved requests. Needs-planning for a broad category that could benefit from relevant shopping history.",
      ),
  })
  .describe("One actionable product request.");

const clarify = z
  .strictObject({ kind: z.literal("clarify").describe("Ask a clarifying question."), question })
  .describe("A request needing a more specific product target.");

const offCatalog = z
  .strictObject({
    kind: z.literal("off-catalog").describe("The request is outside this product catalog."),
  })
  .describe("Catalog scope guidance.");

export const intentDecisionSchema = z
  .discriminatedUnion("kind", [
    z
      .strictObject({
        kind: z.literal("discover").describe("Process the ordered shopping requests."),
        searches: z
          .array(
            z
              .discriminatedUnion("kind", [
                search,
                clarify.extend({ label }).describe("A group requiring clarification."),
                offCatalog.extend({ label }).describe("An off-catalog group."),
              ])
              .describe("The action for this requested group."),
          )
          .min(1)
          .max(3)
          .describe("Up to three groups in the order requested."),
      })
      .describe("One or more independent shopping requests."),
    clarify,
    offCatalog,
    z
      .strictObject({
        kind: z.literal("detail").describe("Refresh one visible product."),
        productId,
      })
      .describe("Retrieve current facts about a prior card."),
    z
      .strictObject({
        kind: z.literal("cheaper").describe("Find a lower-priced alternative."),
        productId: productId
          .nullable()
          .describe("Named card to compare against, or null for the most recent group."),
      })
      .describe("A contextual price refinement."),
    z
      .strictObject({
        kind: z.literal("retry-group").describe("Repeat a specific failed group lookup."),
        label,
      })
      .describe("Retry the named group from a previous turn."),
  ])
  .describe("The model's interpretation of this turn.");

export type IntentDecision = z.infer<typeof intentDecisionSchema>;
