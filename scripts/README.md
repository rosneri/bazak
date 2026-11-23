# Local evaluation and verification commands

## Interface

[evaluate.ts](./evaluate.ts) and [evaluate-live.ts](./evaluate-live.ts) import distinct service factories. [evaluate-suite.ts](./evaluate-suite.ts) executes and scores cases. [test-database.ts](./test-database.ts) runs the integration or browser journey.

`pnpm api:generate` runs Orval and formats the shopper hooks and Zod schemas generated from OpenAPI. `pnpm api:check` verifies the generated files against fresh output. [Generator](./generate-api.mjs) · [OpenAPI specification](../apps/web/openapi.yaml)

## Invariants

Every labeled case runs in its own scope and loads the committed turn for scoring. A result batch has one profile per run. The test harness requires a local Compose host, allocates a unique database and drops it on normal cleanup.

## Side effects

Evaluation records results in the configured database. Live evaluation uses external model and catalog calls. The journey script starts Compose, migrates the isolated database and, for browser verification, starts built Next apps and Chrome.

## Verification

Run `pnpm evaluate` and `pnpm test:journey` from the workspace root.
