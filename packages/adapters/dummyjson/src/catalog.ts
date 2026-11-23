import {
  catalogQuerySchema,
  type ProductCatalog,
} from "@bazak/product-discovery/application/catalog";
import { productSnapshotSchema } from "@bazak/product-discovery/domain/product";
import { z } from "zod";

const productSchema = z
  .object({
    id: z.int().positive().describe("The numeric DummyJSON product ID."),
    title: productSnapshotSchema.shape.title,
    description: productSnapshotSchema.shape.description,
    price: productSnapshotSchema.shape.price,
    stock: productSnapshotSchema.shape.stock,
    thumbnail: productSnapshotSchema.shape.imageUrl,
  })
  .describe("The DummyJSON product fields used by the discovery feature.");

const pageSchema = z
  .object({
    products: z.array(productSchema).describe("The products included in this DummyJSON page."),
    total: z
      .int()
      .nonnegative()
      .describe("The total number of products matching the query before pagination."),
    skip: z.int().nonnegative().describe("The offset returned by DummyJSON for this page."),
  })
  .describe("The DummyJSON response to a paginated product lookup.");

export function createDummyJsonCatalog(fetchCatalog: typeof fetch): ProductCatalog {
  return {
    async findPage(input, signal) {
      const { source, offset, limit } = catalogQuerySchema.parse(input);
      const url = new URL("https://dummyjson.com/products");

      if (source.kind === "search") {
        url.pathname += "/search";
        url.searchParams.set("q", source.keywords);
      } else {
        url.pathname += `/category/${source.category}`;
      }

      url.searchParams.set("skip", String(offset));
      url.searchParams.set("limit", String(limit));

      const response = await fetchCatalog(url, { signal, redirect: "error" });

      if (!response.ok) {
        throw new Error(`DummyJSON catalog request failed with HTTP ${response.status}.`);
      }

      const page = pageSchema.parse(await response.json());
      const expectedCount = Math.min(limit, Math.max(0, page.total - offset));

      if (page.skip !== offset || page.products.length !== expectedCount) {
        throw new Error("DummyJSON returned an unexpected page.");
      }

      const observedAt = new Date().toISOString();

      const products = page.products.map(({ id, thumbnail, ...product }) =>
        productSnapshotSchema.parse({
          ...product,
          id: String(id),
          imageUrl: thumbnail,
          observedAt,
        }),
      );

      return { products, total: page.total, offset: page.skip };
    },
  };
}
