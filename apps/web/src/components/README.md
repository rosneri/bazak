# Shopping desk and cards

## Interface

[ShoppingChat](./shopping-chat.tsx) binds the composer and history UI to the session. [AssistantParts](./product-card.tsx) renders consecutive text and product groups.

## Invariants

Both saved and live groups use the same card. Prices use US dollars. A missing or failed thumbnail displays labeled initials.

## Side effects

User actions start session operations. The browser fetches snapshot image URLs when present.

## Verification

Run `pnpm test:e2e` from the workspace root.
