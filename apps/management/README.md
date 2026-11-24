# Evaluation management app

## Overview

This local Next.js app reads labeled results directly from PostgreSQL on each request. Start it with `pnpm dev:management` and open [Evaluation runs](http://127.0.0.1:3002/). Select **Run evaluations** to record four reports. The button opens the AI model report when the batch finishes. Use the recorded-run selector for the other three. The dashboard and CLI use the same database.

## Report

The landing page opens the newest run, labeled Fixture, Application harness, Production or AI model. Use the run selector to open one of the latest 30 runs. A permanent link with `?run=<UUID>` opens an older run as well. Each score displays both its passes and its applicable denominator. Rows distinguish execution errors and semantic disagreements. First output and total duration appear in separate columns.

Opening a case shows the actual shopper question, any seeded turn, observed groups, and saved evidence. Expand the evidence disclosure for the independent labels, model decision, product IDs, call counts and actual page queries. The report provides empty, loading and storage-unavailable states.

## What the scores measure

The application harness receives scripted intent proposals and exercises the actual routing, repository, planner orchestration and retrieval over a fixed catalog. The AI model receives the same scored prompts and catalog, using the configured live intent model and planner. Its exact-proposal grade compares the complete raw decision to the labeled proposal. Product constraints and abstention are graded separately, so a wording or routing difference can coexist with correct visible products. The production smoke suite uses the live catalog as well.

The category cases exercise every supported category. The fixed catalog has products in fragrances and home decoration. The other category cases require an exhaustive empty result for the intended category. Numbered conversation turns share one thread and are each scored against their own labels. Ordinary cases start with isolated history. A suite saves its rows atomically. If a later suite cannot save, earlier reports are still available in the selector.

## Verification

Run `pnpm --filter @bazak/management typecheck` and `pnpm --filter @bazak/management build`. Building requires no live database. `pnpm test:e2e` exercises the persisted report alongside the shopper app.

[Report route](./app/README.md)
