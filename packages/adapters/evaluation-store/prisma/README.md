# PostgreSQL models and migration

## Interface

[schema.prisma](./schema.prisma) models scoped shopper threads, ordered turns, attempt generations, search history evidence and labeled results. [Migrations](./migrations/README.md) own the database constraints.

## Invariants

A turn’s ordinal and UUID are unique within the thread. The turn holds a single complete assistant message. Each attempt retains its own lease, state and available measurements. A worker that disappears leaves its first-output time and call counts unknown.

## Side effects

`pnpm db:generate` writes the ESM Prisma client under `src/generated`. `pnpm db:migrate` applies checked-in SQL to the configured database.

## Verification

Run `pnpm test:integration` against the isolated test harness.
