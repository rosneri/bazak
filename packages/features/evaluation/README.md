# Labeled evaluation

## Overview

A case supplies an independent expected intent, ordered product constraints, requested counts and planner behavior. The observed side comes from a completed service turn and its recorded catalog queries. Ordinary shopper conversations receive no grades.

## Interfaces

- [Cases](./src/domain/cases.ts) describe fixture and production suites, earlier-turn setup and acceptable product evidence.
- [Result](./src/domain/result.ts) validates observations, execution outcomes and importer batches. [Scoring](./src/application/evaluate.ts) evaluates each applicable dimension independently.
- The root commands `pnpm evaluate` and `pnpm evaluate:live` select separate composition roots. Each run and case receives its own database scope. The service executes setup chats and the scored prompt through its normal send path.

## Verification

Run `pnpm --filter @bazak/evaluations test` for service-free scoring and malformed-import cases. `pnpm evaluate` records the fixture suite in PostgreSQL. These scores describe application contracts against the seeded catalog. A production run measures the configured model and the observed live catalog.
