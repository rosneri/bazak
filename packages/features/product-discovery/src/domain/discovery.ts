import { z } from "zod";

export const categorySlugSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .describe("A category slug to use for a catalog lookup.")
  .meta({ title: "Category slug", examples: ["mobile-accessories"] });

export const searchKeywordsSchema = z
  .string()
  .trim()
  .min(1)
  .describe("Words that describe the products to search for.")
  .meta({ title: "Search keywords", examples: ["wireless headphones"] });

export const discoveryCriteriaSchema = z
  .strictObject({
    category: categorySlugSchema
      .optional()
      .describe("The catalog category that limits this search.")
      .meta({ title: "Search category" }),
    keywords: searchKeywordsSchema
      .optional()
      .describe("The words to search for within the catalog.")
      .meta({ title: "Product keywords" }),
    maxPrice: z
      .number()
      .nonnegative()
      .optional()
      .describe("The highest acceptable price per item, in the catalog currency.")
      .meta({ title: "Maximum price", examples: [50] }),
    priceOrder: z
      .enum(["ascending", "descending"])
      .optional()
      .describe("The requested sort direction for product prices.")
      .meta({ title: "Price order" }),
    count: z
      .int()
      .positive()
      .optional()
      .describe("How many matching products the shopper requested.")
      .meta({ title: "Requested result count", examples: [2] }),
  })
  .refine((criteria) => criteria.category !== undefined || criteria.keywords !== undefined, {
    message: "A product search needs a category or keywords.",
  })
  .describe("Validated criteria for one product search.")
  .meta({ title: "Product discovery criteria" });

export const intentDecisionSchema = z
  .discriminatedUnion("kind", [
    z
      .strictObject({
        kind: z
          .literal("discover")
          .describe("The request contains enough information to search for products.")
          .meta({ title: "Discovery intent kind" }),
        searches: z
          .array(discoveryCriteriaSchema)
          .min(1)
          .describe("One set of criteria for each distinct product request.")
          .meta({ title: "Product searches" }),
      })
      .describe("A turn that calls for product discovery.")
      .meta({ title: "Discovery intent" }),
    z
      .strictObject({
        kind: z
          .literal("clarify")
          .describe("The request needs more information before discovery.")
          .meta({ title: "Clarification intent kind" }),
        question: z
          .string()
          .trim()
          .min(1)
          .describe("The missing detail to ask the shopper for.")
          .meta({ title: "Clarification question" }),
      })
      .describe("A turn that asks the shopper to clarify their request.")
      .meta({ title: "Clarification intent" }),
    z
      .strictObject({
        kind: z
          .literal("off-catalog")
          .describe("The shopper asked for something outside the product catalog.")
          .meta({ title: "Off-catalog intent kind" }),
      })
      .describe("A turn that can be answered without a catalog lookup.")
      .meta({ title: "Off-catalog intent" }),
  ])
  .describe("The model's interpretation of the shopper's request.")
  .meta({ title: "Intent decision" });

export type IntentDecision = z.infer<typeof intentDecisionSchema>;
