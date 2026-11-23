# Browser conversation session

## Interface

[useShoppingSession](./chat-session.ts) uses the five [generated Orval hooks](../api/generated/hooks.ts) and reads saved status through the generated query options. [The query provider](./query-provider.tsx) holds the browser cache for the shopper layout. [Fetch adapters](../api/fetch.ts) validate JSON and expose the successful response stream. [readTurnStream](./stream.ts) validates each decoded event against the generated schema and the conversation's domain rules.

## Invariants

Saved history is cached by conversation ID. Previews and in-flight actions belong to the mounted conversation. An unaccepted competing submission keeps its draft and message ID. Adjacent text deltas form a single passage.

## Side effects

Creating a thread changes the browser URL. Navigating away cancels the active request and pending recovery work. On a lost response, saved history is polled with backoff until completion or the local cutoff. Mutations run once per explicit action, so a repeated click can recover an uncertain request with the same ID.

## Verification

Run `pnpm --filter @bazak/web test` and `pnpm test:e2e` from the workspace root.
