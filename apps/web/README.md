# Shopper web app

The shopping desk opens at `/`. A chat has a permanent `/conversations/[id]` URL. PostgreSQL holds the history, original product snapshots, and attempt state. Questions about a displayed product’s current stock or price trigger a new catalog lookup.

## Build profiles

`pnpm dev` and `pnpm start` use production services. Run `pnpm build` first when using `pnpm start`. The app binds to loopback. On first inference the server reads `OPENAI_API_KEY` from its process environment or the ignored workspace-root `.env`. Browsing existing conversations and building the app work without a key.

`pnpm build:fixture` writes `apps/web/.next-fixture`. `pnpm start:fixture` serves that build. Next resolves the services module at build time. The fixture uses local catalog records, scripted intent and planner decisions, and the same PostgreSQL and conversation service as production. A card without a usable image displays the product’s initials and an accessible image-unavailable label.

## Requests and replies

OpenAPI defines create, list, load, send, and retry, along with their JSON responses and stream events. The browser generates thread and turn UUIDs before sending. Accepted submissions return UTF‑8 SSE with one JSON object per data frame. A new turn emits status and then product groups or text deltas. Only a committed reply emits done. The client reconciles a lost stream with the stored turn and can retry a failed generation. A busy thread keeps the unsent draft. [OpenAPI specification](./openapi.yaml)

An assistant message contains an ordered `parts` array. Each part is either plain text or a registered `{type: "products", version: 1, group}` object. A group carries the label, criteria, coverage, outcome, shopper message, and verified product snapshots. The same React component renders live product events and saved messages. The application controls the surface registry and all catalog facts. This local message format supports one versioned product surface.

For discovery and detail replies, production uses AI SDK structured output for intent and optional query planning, then streams approved framing sentences. Each completed approved sentence appears immediately. Adjacent text deltas become one paragraph in the saved reply. The HTTP handlers and client both validate the typed event shape. [AI SDK structured output](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) · [OpenAI structured output requirements](https://developers.openai.com/api/docs/guides/structured-outputs)

## Verification

- `pnpm --filter @bazak/web test` exercises HTTP responses, replay, error framing and SSE chunk boundaries.
- `pnpm test:e2e` starts local Compose PostgreSQL, creates and migrates a disposable database, builds the fixture shopper and management apps, and launches installed Google Chrome. The browser observes the first sentence before the fixture releases the second, refreshes, continues the chat, opens history and verifies a newly recorded evaluation. Ports 3174 and 3175 must be free.
- `pnpm test:journey` runs the PostgreSQL integration test and that same browser case against one disposable database. Both commands drop the database they created.

[App Router](./app/README.md) · [Shopper implementation](./src/README.md)
