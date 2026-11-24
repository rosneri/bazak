# Conversation

The service acquires one attempt for a stable shopper message, interprets that message in context, and streams verified catalog parts in order. The repository commits a single ordered reply before the stream emits its final content and `done`. Resending a completed turn replays those saved parts.

- [Application](./src/application/README.md) describes turn execution, query planning, threading and the repository contract.
- [Domain](./src/domain/README.md) describes shared history, wire events and the versioned product presentation.

Run `pnpm --filter @bazak/conversation test` for the shopper stories and `pnpm --filter @bazak/conversation typecheck` for static checks.
