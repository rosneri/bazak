# Evaluation scoring

## Interface

[observe and score](./evaluate.ts) extract the saved decision, metrics and ordered groups, then compare them with an independent case label.

## Invariants

A required nonempty group checks count, stock, relevance, price and requested ordering. A labeled zero-match case requires complete coverage. Abstention requires the expected intent and zero lookups.

## Side effects

These functions operate only on supplied values. The calling runner owns persistence.

## Verification

Run `pnpm --filter @bazak/evaluations test` from the workspace root.
