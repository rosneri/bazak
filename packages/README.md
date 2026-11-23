# Workspace packages

## Overview

Shared contracts, external integrations, and presentation primitives used by the applications.

## Subdirectories & Boundaries

- [features](./features/README.md) · Domain and application contracts.
- [adapters](./adapters/README.md) · Catalog HTTP and PostgreSQL conversation and evaluation storage.
- [libraries](./libraries/README.md) · Shared UI primitives and styles.

## Verification

Run `pnpm --filter './packages/**' --parallel typecheck` from the workspace root.
