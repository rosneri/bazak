import assert from "node:assert/strict";
import { test } from "node:test";
import { createDiscoveryService } from "@bazak/product-discovery/application/discovery";
import type { CatalogQuery, ProductCatalog } from "@bazak/product-discovery/application/catalog";
import type { ProductSnapshot } from "@bazak/product-discovery/domain/product";

const observedAt = "2026-11-23T10:00:00.000Z";

function perfume(id: number, price: number, stock = 1): ProductSnapshot {
  return {
    id: String(id),
    title: `Perfume ${id}`,
    description: "Scent",
    category: "fragrances",
    price,
    stock,
    observedAt,
  };
}

function service(findPage: ProductCatalog["findPage"]) {
  return createDiscoveryService({
    findPage,
    async findById() {
      return null;
    },
  });
}

test("under $50 excludes the boundary and sold-out scents while up to $50 includes it", async () => {
  const discovery = service(async () => ({
    products: [perfume(1, 50), perfume(2, 48, 0), perfume(3, 49.99), perfume(4, 9)],
    total: 4,
    offset: 0,
  }));

  const criteria = { category: "fragrances", maxPrice: 50, priceOrder: "ascending" } as const;

  const strict = await discovery.lookup({
    label: "Scents",
    criteria: { ...criteria, priceBoundary: "exclusive" },
  });

  assert.deepEqual(
    strict.products.map((p) => p.id),
    ["4", "3"],
  );
  assert.equal(strict.coverage, "exhaustive");
  const inclusive = await discovery.lookup({ label: "Scents", criteria });
  assert.deepEqual(
    inclusive.products.map((p) => p.id),
    ["4", "3", "1"],
  );
});

test("a repeated product keeps its first price and marks the observed pages partial", async () => {
  const first = Array.from({ length: 20 }, (_, i) => perfume(i + 1, 20));

  const discovery = service(async ({ offset }) =>
    offset === 0
      ? { products: first, total: 21, offset }
      : { products: [perfume(1, 1)], total: 21, offset },
  );

  const result = await discovery.lookup({
    label: "Fragrances",
    criteria: { category: "fragrances", priceOrder: "ascending", count: 1 },
  });

  assert.equal(result.coverage, "partial");
  assert.equal(result.products[0]?.price, 20);
});

test("a three-page search with no affordable product discloses partial coverage", async () => {
  const offsets: number[] = [];

  const discovery = service(async ({ offset, limit }) => {
    offsets.push(offset);

    return {
      products: Array.from({ length: limit }, (_, i) => perfume(offset + i + 1, 90)),
      total: 100,
      offset,
    };
  });

  const result = await discovery.lookup({
    label: "Scents",
    criteria: { category: "fragrances", maxPrice: 15 },
  });

  assert.deepEqual(offsets, [0, 20, 40]);
  assert.equal(result.kind, "empty");
  assert.equal(result.coverage, "partial");
  assert.match(result.message, /more matches/i);
});

test("a history keyword that underfills falls back to the original category and preserves the current budget", async () => {
  const citrus = { ...perfume(1, 20), description: "Fresh citrus fragrance." };
  const queries: CatalogQuery[] = [];

  const discovery = service(async (query) => {
    queries.push(query);

    const products =
      query.source.kind === "search"
        ? [
            citrus,
            { ...perfume(6, 3), description: "Citrus soap", category: "beauty" },
            perfume(4, 75),
          ]
        : [perfume(2, 10), citrus, perfume(3, 50)];

    return { products, offset: 0, total: products.length };
  });

  const result = await discovery.lookup({
    label: "Scents",
    criteria: { category: "fragrances", maxPrice: 30, count: 2 },
    hint: { keywords: "citrus", priceOrder: null },
  });

  assert.deepEqual(
    result.products.map((p) => p.id),
    ["1", "2"],
  );
  assert.deepEqual(
    queries.map((q) => q.source.kind),
    ["search", "category"],
  );
});
