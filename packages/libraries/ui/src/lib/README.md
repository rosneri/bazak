# UI utilities

## Overview

Shared helpers used by UI components.

## Interface

- [utils.ts](./utils.ts) re-exports `cn` from the `cn` dependency.

## Invariants

- Importers and components use the same `cn` implementation.

## Side Effects

- None.

## Verification

Run `pnpm --filter @bazak/ui typecheck` from the workspace root.
