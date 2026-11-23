import { z } from "zod";

export const categorySlugSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .describe("A category slug to use for a catalog lookup.");

export const searchKeywordsSchema = z
  .string()
  .trim()
  .min(1)
  .describe("Words that describe the products to search for.");

export const discoveryCriteriaSchema = z
  .strictObject({
    category: categorySlugSchema
      .optional()
      .describe("The catalog category that limits this search."),
    keywords: searchKeywordsSchema
      .optional()
      .describe("The words to search for within the catalog."),
    maxPrice: z
      .number()
      .nonnegative()
      .optional()
      .describe("The highest acceptable price per item, in the catalog currency."),
    priceOrder: z
      .enum(["ascending", "descending"])
      .optional()
      .describe("The requested sort direction for product prices."),
    count: z
      .int()
      .positive()
      .optional()
      .describe("How many matching products the shopper requested."),
  })
  .refine((criteria) => criteria.category !== undefined || criteria.keywords !== undefined, {
    message: "A product search needs a category or keywords.",
  })
  .describe("Validated criteria for one product search.");

export const intentDecisionSchema = z
  .discriminatedUnion("kind", [
    z
      .strictObject({
        kind: z
          .literal("discover")
          .describe("The request contains enough information to search for products."),
        searches: z
          .array(discoveryCriteriaSchema)
          .min(1)
          .describe("One set of criteria for each distinct product request."),
      })
      .describe("A turn that calls for product discovery."),
    z
      .strictObject({
        kind: z.literal("clarify").describe("The request needs more information before discovery."),
        question: z.string().trim().min(1).describe("The missing detail to ask the shopper for."),
      })
      .describe("A turn that asks the shopper to clarify their request."),
    z
      .strictObject({
        kind: z
          .literal("off-catalog")
          .describe("The shopper asked for something outside the product catalog."),
      })
      .describe("A turn that can be answered without a catalog lookup."),
  ])
  .describe("The model's interpretation of the shopper's request.");

export type IntentDecision = z.infer<typeof intentDecisionSchema>;
