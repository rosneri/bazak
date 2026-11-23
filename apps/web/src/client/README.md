# Browser conversation session

## Interface

[ChatSession](./chat-session.ts) drives create, send, retry and reload. [api.ts](./api.ts) makes same-origin requests. [readTurnStream](./stream.ts) decodes and validates SSE frames.

## Invariants

Previews reconcile to the authoritative saved state. An unaccepted competing submission keeps its draft. Adjacent text deltas form a single passage.

## Side effects

Fetch calls read and mutate server state. Creating a thread changes the browser URL. On a lost response, polling backs off until completion or the local cutoff.

## Verification

Run `pnpm --filter @bazak/web test` and `pnpm test:e2e` from the workspace root.
