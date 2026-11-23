# Conversation collection

## Interface

[route.ts](./route.ts) exports GET (list) and POST (create). [Thread routes](./[id]/README.md) address an existing thread.

## Invariants

A client supplies its UUID. First create returns 201, and repeating it in the same scope returns 200.

## Side effects

Lists read PostgreSQL. Creation writes one empty thread through conversation management.

## Verification

Run `pnpm --filter @bazak/web test` from the workspace root.
