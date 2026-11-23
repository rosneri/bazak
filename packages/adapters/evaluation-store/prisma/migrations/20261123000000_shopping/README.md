# Initial shopping schema

## Interface

[migration.sql](./migration.sql) creates threads, turns, numbered attempts, search evidence and evaluation results.

## Invariants

Unique ordinals order turns. A partial unique index enforces one running turn per thread. Check constraints enforce positive generations, attempt cutoffs and presence of a committed reply on completed turns.

## Side effects

Applying this migration creates PostgreSQL tables, foreign keys and indexes.

## Verification

Run `pnpm test:integration` from the workspace root.
