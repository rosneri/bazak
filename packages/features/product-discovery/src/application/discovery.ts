import { z } from "zod";
import type { CatalogQuery, ProductCatalog } from "@bazak/product-discovery/application/catalog";
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

import { CatalogLookup, type QueryObserver } from "#application/catalog-lookup";
import { rankMatchingProducts } from "#domain/product-ranking";

export { cents } from "#domain/product-ranking";

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

export interface LookupResult {
  kind: "matched" | "empty" | "lookup-error";
  label: string;
  criteria: DiscoveryCriteria;
  products: ProductSnapshot[];
  coverage: "exhaustive" | "partial" | null;
  message: string;
}

function describeLookupResult(
  lookup: CatalogLookup,
  request: LookupRequest,
  complete: boolean,
): LookupResult {
  const { label, criteria, hint } = request;
  const { preferred } = lookup;

  const visible = rankMatchingProducts(
    lookup.snapshots.values(),
    preferred,
    criteria,
    hint?.priceOrder,
  );

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

async function lookupProducts(
  catalog: ProductCatalog,
  input: LookupRequest,
  signal?: AbortSignal,
  onQuery?: QueryObserver,
): Promise<LookupResult> {
  const request = requestSchema.parse(input);
  const { criteria, label, hint } = request;

  const baseSource: CatalogQuery["source"] = criteria.category
    ? { kind: "category", category: criteria.category }
    : { kind: "search", keywords: searchKeywordsSchema.parse(criteria.keywords) };

  const lookup = new CatalogLookup(catalog, signal, onQuery);

  let complete = false;

  try {
    if (hint?.keywords && criteria.category)
      await lookup.collectPreferredProducts(hint.keywords, criteria);

    complete =
      lookup.preferred.size < (criteria.count ?? 3) &&
      (await lookup.collectCatalogPages(baseSource));
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

  return describeLookupResult(lookup, request, complete);
}

export function createDiscoveryService(catalog: ProductCatalog) {
  function lookup(input: LookupRequest, signal?: AbortSignal, onQuery?: QueryObserver) {
    return lookupProducts(catalog, input, signal, onQuery);
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
