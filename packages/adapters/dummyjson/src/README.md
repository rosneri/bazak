# DummyJSON catalog

## Interface

[createDummyJsonCatalog](./catalog.ts) adapts an injected fetch function to keyword, category and single-ID operations.

## Invariants

A page shares one UTC observation time. External numeric IDs become strings. A detail response must match the requested ID and may show zero stock. HTTP 404 on a detail request returns null. Discovery interprets page lengths, offsets and changing totals.

## Side effects

Requests go to the fixed DummyJSON HTTPS origin with cancellation enabled and redirects disabled. Only the keyword query parameter accepts free text, encoded through URLSearchParams. Category paths use an allowed slug and detail paths use a numeric ID. The adapter caps pages at twenty products. Invalid responses or failed requests throw. Thumbnail URLs must point to a raster path on the DummyJSON CDN. A product with an unapproved thumbnail still appears with its text and price.

## Verification

Run `pnpm --filter @bazak/dummyjson test`.
