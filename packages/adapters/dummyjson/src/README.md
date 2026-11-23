# DummyJSON catalog

## Interface

[createDummyJsonCatalog](./catalog.ts) adapts an injected fetch function to keyword, category and single-ID operations.

## Invariants

A page shares one UTC observation time. External numeric IDs become strings. A detail response must match the requested ID and may show zero stock. HTTP 404 on a detail request returns null. Discovery interprets page lengths, offsets and changing totals.

## Side effects

Requests go to the fixed DummyJSON HTTPS origin with cancellation enabled and redirects disabled. Invalid responses or failed requests throw.

## Verification

Run `pnpm --filter @bazak/dummyjson test`.
