import {
  catalogQuerySchema,
  type ProductCatalog,
} from "@bazak/product-discovery/application/catalog";
import { productSnapshotSchema } from "@bazak/product-discovery/domain/product";
import { z } from "zod";

const productSchema = z
  .object({
    id: z.int().positive().describe("The numeric DummyJSON product ID."),
    category: productSnapshotSchema.shape.category,
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

const detailIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,9}$/)
  .describe("A positive decimal DummyJSON product ID.");

function snapshot({ id, thumbnail, ...fields }: z.infer<typeof productSchema>, observedAt: string) {
  return productSnapshotSchema.parse({
    ...fields,
    id: String(id),
    imageUrl: thumbnail,
    observedAt,
  });
}

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
      const observedAt = new Date().toISOString();

      return {
        products: page.products.map((product) => snapshot(product, observedAt)),
        total: page.total,
        offset: page.skip,
      };
    },
    async findById(rawId, signal) {
      const id = detailIdSchema.parse(rawId);

      const response = await fetchCatalog(new URL("https://dummyjson.com/products/" + id), {
        signal,
        redirect: "error",
      });

      if (response.status === 404) return null;

      if (!response.ok)
        throw new Error(`DummyJSON catalog request failed with HTTP ${response.status}.`);

      const product = snapshot(
        productSchema.parse(await response.json()),
        new Date().toISOString(),
      );

      if (product.id !== id) throw new Error("DummyJSON returned a different product ID.");

      return product;
    },
  };
}
