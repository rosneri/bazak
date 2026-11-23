# Submit a turn

## Interface

[route.ts](./route.ts) forwards the thread ID and POST body to the send handler. [Turn operations](./[turnId]/README.md) operate on the existing turn.

## Invariants

The client supplies a stable turn ID and text. Accepted sends receive a UTF-8 SSE response. A conflicting new turn receives HTTP 409.

## Side effects

Accepted turns can invoke storage, catalog and model operations. Completed duplicates replay their committed message.

## Verification

Run `pnpm --filter @bazak/web test` from the workspace root.
