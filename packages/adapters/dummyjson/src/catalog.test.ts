import assert from "node:assert/strict";
import { test } from "node:test";
import { createDummyJsonCatalog } from "@bazak/dummyjson";

test("maps a keyword search page into catalog snapshots", async () => {
  const signal = new AbortController().signal;

  const catalog = createDummyJsonCatalog(async (url, options) => {
    assert.equal(
      String(url),
      "https://dummyjson.com/products/search?q=milk+%26+honey&skip=1&limit=1",
    );
    assert.equal(options?.signal, signal);
    assert.equal(options?.redirect, "error");

    return Response.json({
      products: [
        {
          id: 12,
          title: "Milk & Honey Soap",
          description: "A bar of soap.",
          price: 4.5,
          stock: 8,
          thumbnail: "https://cdn.dummyjson.com/product-images/soap.webp",
          discountPercentage: 5,
        },
      ],
      total: 2,
      skip: 1,
    });
  });

  const page = await catalog.findPage(
    { source: { kind: "search", keywords: "milk & honey" }, offset: 1, limit: 1 },
    signal,
  );

  assert.equal(page.offset, 1);
  assert.equal(page.total, 2);
  assert.equal(page.products.length, 1);
  assert.equal(page.products[0]?.id, "12");
  assert.equal(page.products[0]?.price, 4.5);
  assert.equal(page.products[0]?.imageUrl, "https://cdn.dummyjson.com/product-images/soap.webp");
});

test("returns an empty category page when the catalog has no matches", async () => {
  const catalog = createDummyJsonCatalog(async (url) => {
    assert.equal(String(url), "https://dummyjson.com/products/category/fragrances?skip=0&limit=10");

    return Response.json({ products: [], total: 0, skip: 0 });
  });

  assert.deepEqual(
    await catalog.findPage({
      source: { kind: "category", category: "fragrances" },
      offset: 0,
      limit: 10,
    }),
    { products: [], total: 0, offset: 0 },
  );
});

test("rejects invalid responses and preserves a drifting page for coverage checks", async () => {
  const query = {
    source: { kind: "category", category: "fragrances" },
    offset: 0,
    limit: 10,
  } as const;

  const failedCatalog = createDummyJsonCatalog(async () => new Response(null, { status: 503 }));

  const malformedCatalog = createDummyJsonCatalog(async () =>
    Response.json({ products: [{ id: 9 }], total: 1, skip: 0 }),
  );

  const driftingCatalog = createDummyJsonCatalog(async () =>
    Response.json({ products: [], total: 1, skip: 0 }),
  );

  await assert.rejects(failedCatalog.findPage(query), /HTTP 503/);
  await assert.rejects(malformedCatalog.findPage(query), { name: "ZodError" });
  assert.deepEqual(await driftingCatalog.findPage(query), { products: [], total: 1, offset: 0 });
});

test("rejects a category with path separators before fetch", async () => {
  let attemptedFetch = false;

  const catalog = createDummyJsonCatalog(async () => {
    attemptedFetch = true;

    return Response.json({ products: [], total: 0, skip: 0 });
  });

  await assert.rejects(
    // @ts-expect-error Exercise invalid external input at the adapter boundary.
    catalog.findPage({ source: { kind: "category", category: "../search" }, offset: 0, limit: 10 }),
    { name: "ZodError" },
  );
  assert.equal(attemptedFetch, false);
});

test("refreshes one numeric product using the detail operation in the supplied OpenAPI contract", async () => {
  const { readFileSync } = await import("node:fs");

  const spec = JSON.parse(
    readFileSync(
      new URL("../../../../assignment/dummyjson_products_openapi.json", import.meta.url),
      "utf8",
    ),
  );

  assert.equal(spec.paths["/products/{id}"].get.parameters[0].name, "id");

  const catalog = createDummyJsonCatalog(async (url, init) => {
    assert.equal(String(url), "https://dummyjson.com/products/7");
    assert.equal(init?.redirect, "error");

    return Response.json({
      id: 7,
      title: "Rose",
      description: "A floral scent.",
      price: 26,
      stock: 0,
      category: "fragrances",
    });
  });

  assert.equal((await catalog.findById("7"))?.stock, 0);
  await assert.rejects(catalog.findById("7?skip=0"), { name: "ZodError" });
  const missing = createDummyJsonCatalog(async () => new Response(null, { status: 404 }));
  assert.equal(await missing.findById("7"), null);
});
