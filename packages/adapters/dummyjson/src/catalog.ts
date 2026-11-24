import {
  catalogQuerySchema,
  type ProductCatalog,
  type ProviderRequestObserver,
} from "@bazak/product-discovery/application/catalog";
import { productSnapshotSchema } from "@bazak/product-discovery/domain/product";
import { CatalogHttpError, readWithRetry } from "#read-retry";
import { z } from "zod";
import { approvedCatalogThumbnail } from "@bazak/dummyjson/thumbnail";

const maxProducts = 20;

const maxResponseBytes = 512 * 1024;

const querySchema = catalogQuerySchema
  .extend({
    limit: catalogQuerySchema.shape.limit
      .max(maxProducts)
      .describe("DummyJSON page size, capped at twenty products."),
  })
  .describe("A bounded DummyJSON product-list request.");

const productSchema = z
  .object({
    id: z.int().positive().describe("The numeric DummyJSON product ID."),
    category: productSnapshotSchema.shape.category,
    title: productSnapshotSchema.shape.title,
    description: productSnapshotSchema.shape.description,
    price: productSnapshotSchema.shape.price,
    stock: productSnapshotSchema.shape.stock,
    thumbnail: z
      .string()
      .optional()
      .catch(undefined)
      .describe("Optional thumbnail from the catalog."),
  })
  .describe("The DummyJSON product fields used by the discovery feature.");

const pageSchema = z
  .object({
    products: z
      .array(productSchema)
      .max(maxProducts)
      .describe("The products included in this DummyJSON page."),
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
    imageUrl: approvedCatalogThumbnail(thumbnail),
    observedAt,
  });
}

async function readCatalogJson<Schema extends z.ZodType>(
  response: Response,
  schema: Schema,
  signal?: AbortSignal,
): Promise<z.output<Schema>> {
  if (!response.body) {
    signal?.throwIfAborted();
    throw new Error("DummyJSON returned an empty response.");
  }

  const decoder = new TextDecoder();
  let bytes = 0;
  let json = "";

  await response.body.pipeTo(
    new WritableStream<Uint8Array>({
      write(chunk) {
        bytes += chunk.byteLength;

        if (bytes > maxResponseBytes)
          throw new Error("DummyJSON response exceeded the catalog byte limit.");
        json += decoder.decode(chunk, { stream: true });
      },
    }),
    { signal },
  );
  signal?.throwIfAborted();

  return schema.parse(JSON.parse(json + decoder.decode()));
}

function catalogPageUrl(input: z.input<typeof querySchema>) {
  const { source, offset, limit } = querySchema.parse(input);
  const url = new URL("https://dummyjson.com/products");

  if (source.kind === "search") {
    url.pathname += "/search";
    url.searchParams.set("q", source.keywords);
  } else {
    url.pathname += `/category/${source.category}`;
  }

  url.searchParams.set("skip", String(offset));
  url.searchParams.set("limit", String(limit));

  return url;
}

function readCatalog<Schema extends z.ZodType>(
  fetchCatalog: typeof fetch,
  url: URL,
  schema: Schema,
  signal?: AbortSignal,
  onRequest?: ProviderRequestObserver,
) {
  return readWithRetry(async () => {
    onRequest?.(url.href);
    const response = await fetchCatalog(url, { signal, redirect: "error", cache: "no-store" });

    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new CatalogHttpError(response);
    }

    return readCatalogJson(response, schema, signal);
  }, signal);
}

export function createDummyJsonCatalog(fetchCatalog: typeof fetch): ProductCatalog {
  return {
    async findPage(input, signal, onRequest) {
      const url = catalogPageUrl(input);
      const page = await readCatalog(fetchCatalog, url, pageSchema, signal, onRequest);
      const observedAt = new Date().toISOString();

      return {
        products: page.products.map((product) => snapshot(product, observedAt)),
        total: page.total,
        offset: page.skip,
      };
    },
    async findById(rawId, signal, onRequest) {
      const id = detailIdSchema.parse(rawId);

      const url = new URL("https://dummyjson.com/products/" + id);

      const record = await readCatalog(fetchCatalog, url, productSchema, signal, onRequest).catch(
        (error) => {
          if (error instanceof CatalogHttpError && error.response.status === 404) return null;
          throw error;
        },
      );

      if (!record) return null;
      const product = snapshot(record, new Date().toISOString());

      if (product.id !== id) throw new Error("DummyJSON returned a different product ID.");

      return product;
    },
  };
}
