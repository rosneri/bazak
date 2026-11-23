# Evaluation management app

## Overview

This local Next.js app reads labeled results directly from PostgreSQL on each request. Start it with `pnpm dev:management` and open [Evaluation runs](http://127.0.0.1:3002/). Run `pnpm evaluate` to populate it. Both processes must use the same database.

## Report

The landing page opens the newest run, labeled Fixture or Production. Use the run selector to open one of the latest 30 runs. A permanent link with `?run=<UUID>` opens an older run as well. Each score displays both its passes and its applicable denominator. Rows distinguish execution errors and semantic disagreements. First output and total duration appear in separate columns.

Opening a case shows the actual shopper question, any seeded turn, observed groups, and saved evidence. Expand the evidence disclosure for the independent labels, model decision, product IDs, call counts and actual page queries. The report provides empty, loading and storage-unavailable states.

## Verification

Run `pnpm --filter @bazak/management typecheck` and `pnpm --filter @bazak/management build`. Building requires no live database. `pnpm test:e2e` exercises the persisted report alongside the shopper app.

[Report route](./app/README.md)
