# Shopper routes

## Interface

[page.tsx](./page.tsx) opens the shopping desk. [Thread pages](./conversations/README.md) restore a specific chat. The [API](./api/README.md) implements create, list, load, send and retry.

## Invariants

A saved chat is addressable at `/conversations/<id>`. Both pages use the same shopping desk and current API records.

## Side effects

The root layout loads the shared theme and shopper stylesheet. Route handlers use the build-selected services.

## Verification

Run `pnpm test:e2e`. See [shopper verification](../README.md#verification).
