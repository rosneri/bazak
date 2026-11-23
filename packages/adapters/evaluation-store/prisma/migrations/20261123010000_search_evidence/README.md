# Rebuild the planner history index

## Interface

[migration.sql](./migration.sql) rebuilds derived search evidence from committed product parts and the completed generation’s recorded queries.

## Invariants

An eligible group is matched or empty and has category criteria. A completed attempt must have recorded a page query. Multiple qualifying groups from the same turn and category share one ordered criteria array. Clarification and failed lookup groups supply no evidence.

## Side effects

The migration deletes and reconstructs the derived PostgreSQL index rows in one transaction. Shopper turns, saved replies and evaluation results remain their sources of record.

## Verification

Run `pnpm test:integration` for grouped history and clarification beside a successful sibling.
