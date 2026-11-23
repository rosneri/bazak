# Evaluation report page

## Interface

[Page](./page.tsx) reads the newest persisted run or the `run` UUID in the query string. The optional `case` UUID opens its case evidence. [loading.tsx](./loading.tsx) supplies the route fallback.

## Invariants

All report reads are request-time. Score counters use only applicable cases. Execution errors, semantic disagreements and empty runs have distinct presentations.

## Side effects

Opening a page reads evaluation results via the PostgreSQL adapter.

## Verification

Run `pnpm test:e2e` from the workspace root.
