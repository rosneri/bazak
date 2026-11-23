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
            kind: z.literal("search").describe("Look up products by keyword."),
            keywords: searchKeywordsSchema,
          })
          .describe("A keyword search across catalog products."),
        z
          .strictObject({
            kind: z.literal("category").describe("Look up products from a single category."),
            category: categorySlugSchema,
          })
          .describe("A lookup within one catalog category."),
      ])
      .describe("The lookup selected by the discovery application."),
    offset: z.int().nonnegative().describe("The number of catalog matches to skip."),
    limit: z.int().positive().describe("The maximum number of products to fetch in this page."),
  })
  .describe("A page of catalog results to retrieve through the catalog port.");

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

export interface CatalogPage {
  readonly products: readonly ProductSnapshot[];
  readonly total: number;
  readonly offset: number;
}

export interface ProductCatalog {
  findPage(query: CatalogQuery, signal?: AbortSignal): Promise<CatalogPage>;
}
