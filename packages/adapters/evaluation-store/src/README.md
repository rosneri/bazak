# Durable storage

## Interface

[Connection setup](./client.ts) creates a three-connection pool with a three-second connection timeout. [databaseUrl](./database-url.ts) selects `DATABASE_URL` or the loopback Compose service on port 55432, honoring exported `POSTGRES_PASSWORD` and `POSTGRES_PORT`. [Conversation operations](./conversations.ts) implement the scoped port. [Results](./results.ts) imports batches and serves the dashboard.

## Invariants

[Retry eligibility](./attempts.ts) requires the observed failed or interrupted generation. Terminal writes fence stale attempts. Reads validate saved payloads. History queries exclude the active chat and use at most five earlier turns per category with 240-character shopper excerpts. Each record carries all of that turn’s successful same-category searches in order. Questions and lookup errors supply no criteria.

## Side effects

Conversation mutations acquire transaction-scoped PostgreSQL locks. Batch imports commit atomically. Importing identical result IDs again has no effect, and conflicting evidence rolls back the batch. [CLI importer](./import.ts) reads a JSON file and disconnects when finished.

## Verification

Run `pnpm --filter @bazak/evaluation-store typecheck` and `pnpm test:integration`.
