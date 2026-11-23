# Single conversation

## Interface

[route.ts](./route.ts) loads saved history with GET. [Turns](./turns/README.md) handles submissions.

## Invariants

A valid UUID selects a thread in the current scope. Turns are returned in ordinal order.

## Side effects

The repository reads the thread and reconciles expired work on load.

## Verification

Run `pnpm --filter @bazak/web test` from the workspace root.
