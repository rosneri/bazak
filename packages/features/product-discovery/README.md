# Product discovery

`createDiscoveryService(catalog)` reads bounded product pages, verifies stock and price, and returns a labeled result with coverage. `detail` refreshes one card even when it is now sold out.

- [Application](./src/application/README.md) describes API operations, fallback and ranking.
- [Domain](./src/domain/README.md) describes product observations and validated shopper criteria.

Run `pnpm --filter @bazak/product-discovery test` and `pnpm --filter @bazak/product-discovery typecheck`.
