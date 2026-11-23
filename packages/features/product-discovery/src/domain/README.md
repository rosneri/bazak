# Discovery domain

## Interface

[discovery.ts](./discovery.ts) defines allowed categories, criteria and intent decisions. [product.ts](./product.ts) defines the observed product ID, title, description, price, stock, timestamp and available category and image URL.

## Invariants

A discovery decision has one to three ordered groups. Search criteria specify a product target and allow up to ten requested cards. Clarification or off-catalog guidance can stand alone or accompany searchable groups. Separate decisions express cheaper alternatives, refreshed details and retry of a failed group.

## Side effects

These schemas parse supplied data. The application and catalog adapter perform retrieval.

## Verification

Run `pnpm --filter @bazak/product-discovery test`.
