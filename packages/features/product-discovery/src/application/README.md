# Catalog discovery

## Interface

The [catalog port](./catalog.ts) supports paginated keyword and category queries and a detail lookup. [createDiscoveryService](./discovery.ts) selects operations and returns a labeled group with verified products and coverage.

## Invariants

Each group has at most three pages of 20. Results must match all explicit terms, category, stock and price criteria. Comparisons use integer cents and “under” excludes the ceiling. The first observation per ID wins. An explicit price order wins over soft hints, and ties retain catalog order. A complete base scan requires stable totals, offsets, page sizes and distinct IDs.

## Side effects

Reads go through the injected catalog. A planner keyword can trigger a targeted search inside the category before a base scan on underfill. A targeted-only result has partial category coverage. Detail refresh can return a sold-out product.

## Verification

Run `pnpm --filter @bazak/product-discovery test`.
