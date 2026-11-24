import { z } from "zod";
import {
  catalogQuerySchema,
  type CatalogQuery,
  type ProductCatalog,
} from "@bazak/product-discovery/application/catalog";
import type { DiscoveryCriteria } from "@bazak/product-discovery/domain/discovery";
import { matchesDiscoveryCriteria } from "#domain/product-ranking";
import {
  productSnapshotSchema,
  type ProductSnapshot,
} from "@bazak/product-discovery/domain/product";

const pageSchema = z
  .object({
    products: z.array(productSnapshotSchema).max(20).describe("Observed products."),
    total: z.int().nonnegative().describe("Reported total matches."),
    offset: z.int().nonnegative().describe("Returned offset."),
  })
  .describe("A retrieved catalog page.");

export type QueryObserver = (query: CatalogQuery) => void;

const PAGE_SIZE = 20;

const MAX_PAGES = 3;

export class CatalogLookup {
  readonly snapshots = new Map<string, ProductSnapshot>();
  readonly preferred = new Set<string>();
  private requests = 0;
  private readonly catalog: ProductCatalog;
  private readonly signal?: AbortSignal;
  private readonly onQuery?: QueryObserver;

  constructor(catalog: ProductCatalog, signal?: AbortSignal, onQuery?: QueryObserver) {
    this.catalog = catalog;
    this.signal = signal;
    this.onQuery = onQuery;
  }

  private async readPage(source: CatalogQuery["source"], offset: number) {
    this.signal?.throwIfAborted();
    const query = catalogQuerySchema.parse({ source, offset, limit: PAGE_SIZE });
    this.requests++;
    this.onQuery?.(query);
    const page = pageSchema.parse(await this.catalog.findPage(query, this.signal));
    this.signal?.throwIfAborted();

    return page;
  }

  private remember(product: ProductSnapshot) {
    if (!this.snapshots.has(product.id)) this.snapshots.set(product.id, product);
  }

  async collectPreferredProducts(keywords: string, criteria: DiscoveryCriteria) {
    const page = await this.readPage({ kind: "search", keywords }, 0).catch(() => {
      this.signal?.throwIfAborted();

      return null;
    });

    const hintedTerms = keywords.toLowerCase().split(/\s+/);

    for (const product of page?.products ?? []) {
      const content = [product.title, product.description].join(" ").toLowerCase();

      if (
        matchesDiscoveryCriteria(product, criteria) &&
        hintedTerms.every((word) => content.includes(word))
      ) {
        this.remember(product);
        this.preferred.add(product.id);
      }
    }
  }

  async collectCatalogPages(baseSource: CatalogQuery["source"]) {
    let stable = true;
    let offset = 0;
    let previousTotal: number | undefined;
    const baseIds = new Set<string>();

    while (this.requests < MAX_PAGES) {
      // Each next offset depends on the page the catalog returned.
      // oxlint-disable-next-line no-await-in-loop
      const page = await this.readPage(baseSource, offset);
      stable &&=
        page.offset === offset &&
        (previousTotal === undefined || previousTotal === page.total) &&
        page.products.length === Math.min(PAGE_SIZE, Math.max(0, page.total - offset));

      for (const product of page.products) {
        if (baseIds.has(product.id)) stable = false;
        baseIds.add(product.id);
        this.remember(product);
      }

      offset += page.products.length;
      previousTotal = page.total;

      if (offset >= page.total) {
        return (
          stable &&
          baseIds.size === page.total &&
          [...this.preferred].every((id) => baseIds.has(id))
        );
      }

      if (page.products.length === 0) break;
    }

    return false;
  }
}
