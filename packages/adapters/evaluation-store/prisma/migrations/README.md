# Prisma migrations

Prisma applies the checked-in migrations in order. The lock file selects PostgreSQL.

## Subdirectories and boundaries

- [Initial shopping schema](./20261123000000_shopping/README.md) · tables and database-enforced invariants.
- [Search evidence backfill](./20261123010000_search_evidence/README.md) · reconstruct successful same-category searches from persisted outcomes.
