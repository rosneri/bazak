import { z } from "zod";
import {
  catalogQuerySchema,
  type CatalogQuery,
  type ProductCatalog,
} from "@bazak/product-discovery/application/catalog";
import {
  discoveryCriteriaSchema,
  searchKeywordsSchema,
  priceOrderSchema,
  type DiscoveryCriteria,
} from "@bazak/product-discovery/domain/discovery";
import {
  productSnapshotSchema,
  type ProductSnapshot,
} from "@bazak/product-discovery/domain/product";

export const searchHintSchema = z
  .strictObject({
    keywords: searchKeywordsSchema
      .nullable()
      .describe("An optional term to try inside the explicit category first."),
    priceOrder: priceOrderSchema
      .nullable()
      .describe("Preferred price direction when none is explicit."),
  })
  .describe("Soft preferences for this request only.");

export type SearchHint = z.infer<typeof searchHintSchema>;

const requestSchema = z
  .strictObject({
    label: z.string().min(1).describe("Shopper-facing group name."),
    criteria: discoveryCriteriaSchema,
    hint: searchHintSchema.optional().describe("Validated soft preferences, when available."),
  })
  .describe("One bounded lookup.");

type LookupRequest = z.infer<typeof requestSchema>;

const pageSchema = z
  .object({
    products: z.array(productSnapshotSchema).max(20).describe("Observed products."),
    total: z.int().nonnegative().describe("Reported total matches."),
    offset: z.int().nonnegative().describe("Returned offset."),
  })
  .describe("A retrieved catalog page.");

export interface LookupResult {
  kind: "matched" | "empty" | "lookup-error";
  label: string;
  criteria: DiscoveryCriteria;
  products: ProductSnapshot[];
  coverage: "exhaustive" | "partial" | null;
  message: string;
}

type QueryObserver = (query: CatalogQuery) => void;

const PAGE_SIZE = 20;

const MAX_PAGES = 3;

export const cents = (price: number) => Math.round(price * 100);

function matches(product: ProductSnapshot, criteria: DiscoveryCriteria) {
  const price = cents(product.price);

  const ceiling =
    criteria.maxPrice === undefined
      ? Infinity
      : cents(criteria.maxPrice) - (criteria.priceBoundary === "exclusive" ? 1 : 0);

  const searchable = [product.title, product.description, product.category].join(" ").toLowerCase();

  return (
    product.stock > 0 &&
    price <= ceiling &&
    (!criteria.category || product.category === criteria.category) &&
    (!criteria.keywords ||
      criteria.keywords
        .toLowerCase()
        .split(/\s+/)
        .every((word) => searchable.includes(word)))
  );
}

export function createDiscoveryService(catalog: ProductCatalog) {
  async function lookup(
    input: LookupRequest,
    signal?: AbortSignal,
    onQuery?: QueryObserver,
  ): Promise<LookupResult> {
    const { criteria, label, hint } = requestSchema.parse(input);
    const count = criteria.count ?? 3;

    const baseSource: CatalogQuery["source"] = criteria.category
      ? { kind: "category", category: criteria.category }
      : { kind: "search", keywords: searchKeywordsSchema.parse(criteria.keywords) };

    const snapshots = new Map<string, ProductSnapshot>();
    const preferred = new Set<string>();
    let requests = 0;
    let stable = true;
    let complete = false;

    async function read(source: CatalogQuery["source"], offset: number) {
      signal?.throwIfAborted();
      const query = catalogQuerySchema.parse({ source, offset, limit: PAGE_SIZE });
      requests++;
      onQuery?.(query);
      const page = pageSchema.parse(await catalog.findPage(query, signal));
      signal?.throwIfAborted();

      return page;
    }

    function remember(product: ProductSnapshot) {
      if (!snapshots.has(product.id)) snapshots.set(product.id, product);
    }

    try {
      if (hint?.keywords && criteria.category) {
        const page = await read({ kind: "search", keywords: hint.keywords }, 0).catch(() => {
          signal?.throwIfAborted();

          return null;
        });

        const hintedTerms = hint.keywords.toLowerCase().split(/\s+/);

        for (const product of page?.products ?? []) {
          const content = [product.title, product.description].join(" ").toLowerCase();

          if (matches(product, criteria) && hintedTerms.every((word) => content.includes(word))) {
            remember(product);
            preferred.add(product.id);
          }
        }
      }

      if (preferred.size < count) {
        let offset = 0;
        let previousTotal: number | undefined;
        const baseIds = new Set<string>();

        while (requests < MAX_PAGES) {
          // Each next offset depends on the page the catalog returned.
          // oxlint-disable-next-line no-await-in-loop
          const page = await read(baseSource, offset);
          stable &&=
            page.offset === offset &&
            (previousTotal === undefined || previousTotal === page.total) &&
            page.products.length === Math.min(PAGE_SIZE, Math.max(0, page.total - offset));

          for (const product of page.products) {
            if (baseIds.has(product.id)) stable = false;
            baseIds.add(product.id);
            remember(product);
          }

          offset += page.products.length;
          previousTotal = page.total;

          if (offset >= page.total) {
            complete =
              stable &&
              baseIds.size === page.total &&
              [...preferred].every((id) => baseIds.has(id));
            break;
          }

          if (page.products.length === 0) break;
        }
      }
    } catch {
      signal?.throwIfAborted();

      return {
        kind: "lookup-error",
        label,
        criteria,
        products: [],
        coverage: null,
        message: "The catalog lookup failed. You can ask to try this group again.",
      };
    }

    const products = Array.from(snapshots.values()).filter((product) => matches(product, criteria));
    const order = criteria.priceOrder ?? hint?.priceOrder;
    products.sort((a, b) => {
      const preference = Number(preferred.has(b.id)) - Number(preferred.has(a.id));

      const priceDifference =
        order === "ascending"
          ? cents(a.price) - cents(b.price)
          : order === "descending"
            ? cents(b.price) - cents(a.price)
            : 0;

      return criteria.priceOrder ? priceDifference : preference || priceDifference;
    });
    const visible = products.slice(0, count);

    const result =
      visible.length === 0
        ? "No matches found."
        : `Showing ${visible.length} matching ${visible.length === 1 ? "product" : "products"}.`;

    const coverage = complete
      ? "All catalog pages for this lookup were checked."
      : "Only part of the catalog was checked. There may be more matches.";

    const preference =
      preferred.size > 0
        ? ` Products matching “${hint?.keywords}” were prioritized.`
        : hint?.priceOrder && !criteria.priceOrder
          ? ` ${hint.priceOrder === "ascending" ? "Lower" : "Higher"} prices were prioritized.`
          : "";

    return {
      kind: visible.length ? "matched" : "empty",
      label,
      criteria,
      products: visible,
      coverage: complete ? "exhaustive" : "partial",
      message: `${result} ${coverage}${preference}`,
    };
  }

  async function detail(id: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const product = await catalog.findById(id, signal);
    signal?.throwIfAborted();

    if (!product) return null;
    const snapshot = productSnapshotSchema.parse(product);

    if (snapshot.id !== id) throw new Error("Catalog detail did not match the requested ID.");

    return snapshot;
  }

  return { lookup, detail };
}

export type DiscoveryService = ReturnType<typeof createDiscoveryService>;
