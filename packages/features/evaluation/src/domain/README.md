# Evaluation cases and results

## Interface

[Cases](./cases.ts) hold the exact prompt, optional seed chat or prior turn, expected intent, ordered groups, relevance labels, required product counts, strict price ceilings and optional ordering. Planner labels can require a specific call count and observed query term.

[Result](./result.ts) validates a UUID-identified result with a UTC timestamp, run, profile, expected labels, actual decisions, product snapshots and metrics.

## Invariants

Execution errors carry a diagnostic and null semantic scores. Unscored checks add nothing to the denominator. Time to first server-emitted content can be null and cannot occur after the measured duration. An import contains 1–500 distinct result IDs.

## Side effects

Parsing and pass-count calculations use only supplied values. The evaluation CLI persists them.

## Verification

Run `pnpm --filter @bazak/evaluations test`.
