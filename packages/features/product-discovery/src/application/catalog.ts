import { z } from "zod";
import {
  categorySlugSchema,
  searchKeywordsSchema,
} from "@bazak/product-discovery/domain/discovery";
import type { ProductSnapshot } from "@bazak/product-discovery/domain/product";

export const catalogQuerySchema = z
  .strictObject({
    source: z
      .discriminatedUnion("kind", [
        z
          .strictObject({
            kind: z
              .literal("search")
              .describe("Look up products by keyword.")
              .meta({ title: "Keyword lookup kind" }),
            keywords: searchKeywordsSchema,
          })
          .describe("A keyword search across catalog products.")
          .meta({ title: "Catalog keyword search" }),
        z
          .strictObject({
            kind: z
              .literal("category")
              .describe("Look up products from a single category.")
              .meta({ title: "Category lookup kind" }),
            category: categorySlugSchema,
          })
          .describe("A lookup within one catalog category.")
          .meta({ title: "Catalog category lookup" }),
      ])
      .describe("The lookup selected by the discovery application.")
      .meta({ title: "Catalog lookup source" }),
    offset: z
      .int()
      .nonnegative()
      .describe("The number of catalog matches to skip.")
      .meta({ title: "Page offset", examples: [0, 30] }),
    limit: z
      .int()
      .positive()
      .describe("The maximum number of products to fetch in this page.")
      .meta({ title: "Page size", examples: [30] }),
  })
  .describe("A page of catalog results to retrieve through the catalog port.")
  .meta({ title: "Catalog page query" });

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

export interface CatalogPage {
  readonly products: readonly ProductSnapshot[];
  readonly total: number;
  readonly offset: number;
}

export interface ProductCatalog {
  findPage(query: CatalogQuery, signal?: AbortSignal): Promise<CatalogPage>;
}
