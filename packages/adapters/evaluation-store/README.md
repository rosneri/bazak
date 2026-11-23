# PostgreSQL adapter

## Overview

This package owns the Prisma client, the checked-in PostgreSQL migrations, durable shopping conversations and immutable labeled evaluation results. The shopper and management apps share one database.

## Interfaces

- [Conversation repository](./src/conversations.ts) implements the conversation feature’s port. Call `createConversationRepository(scope)` for one shopper or evaluation case.
- [Evaluation store](./src/results.ts) imports batches, lists the 30 most recent runs and reads a complete run by ID. [CLI importer](./src/import.ts) accepts a JSON array conforming to the evaluation package’s batch schema.
- [Connection setup](./src/README.md) and [database schema](./prisma/README.md) document runtime configuration and persisted records.

## Invariants and side effects

The adapter serializes changes to one thread within short transactions. The partial unique index permits one running turn per thread. Terminal writes verify the active generation and lease. A result import commits its entire validated batch or rolls back. Reusing a result ID with different evidence fails.

## Verification

Run `pnpm db:generate`, `pnpm db:up`, `pnpm --filter @bazak/evaluation-store test` and `pnpm test:integration`. The integration journey creates two threads, reopens a saved follow-up, imports a scored result twice and verifies planner evidence for mixed and repeated categories.
