# Retry a numbered attempt

## Interface

[route.ts](./route.ts) forwards POST to the retry handler with the two URL IDs.

## Invariants

The JSON body carries a positive `expectedAttempt`. Only the currently failed or interrupted generation starts new work.

## Side effects

The repository may create a new attempt against the existing user message. A stale retry returns the stored status and replays an already committed reply.

## Verification

Run `pnpm --filter @bazak/web test` from the workspace root.
