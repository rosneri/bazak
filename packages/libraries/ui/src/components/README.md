# UI components

## Overview

Shared React primitives for the workspace apps.

## Interface

- `Button` in [button.tsx](./button.tsx) accepts native button props and the optional `variant`, `size`, and `asChild` props.

- `Card` in [card.tsx](./card.tsx) accepts native article props and merges caller classes with the shared card styling.

## Invariants

- `Card` renders an article with `data-slot="card"`.
- `Button` defaults to the `default` variant and size. It renders a native button by default and uses Radix `Slot.Root` when `asChild` is set.

## Side Effects

- Rendering applies button classes and `data-*` attributes and forwards the remaining props to the rendered element.

## Verification

Run `pnpm --filter @bazak/ui typecheck` from the workspace root.
