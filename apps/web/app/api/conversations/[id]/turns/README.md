# Submit a turn

## Interface

[route.ts](./route.ts) forwards the thread ID and POST body to the send handler. [Turn operations](./[turnId]/README.md) operate on the existing turn.

## Invariants

The client supplies a stable turn ID and text. Accepted sends receive a UTF-8 SSE response with one JSON object per `data` frame. A conflicting new turn receives HTTP 409 with a JSON error. A failure during streaming ends the response with an `error` event, so the client can reload the saved turn.

## Side effects

Accepted turns can invoke storage, catalog and model operations. Completed duplicates replay their committed message.

## Verification

Run `pnpm --filter @bazak/web test` from the workspace root.
