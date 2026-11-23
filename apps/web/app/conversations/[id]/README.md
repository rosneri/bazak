# Saved conversation page

## Interface

[page.tsx](./page.tsx) mounts `ShoppingChat` with the dynamic thread ID.

## Invariants

The UUID in the URL selects the history to restore. The client validates the response from the local API.

## Side effects

Mounting the shopping desk triggers history reads. Loading history does not run inference.

## Verification

Run `pnpm test:e2e` from the workspace root.
