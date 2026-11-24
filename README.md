# Bazak shopping copilot

Bazak is a local chat for finding products in DummyJSON. Ask for two fragrances under $50, inspect the cards, then ask for a cheaper one. Reload the page or reopen the chat from history to see exactly which products and prices were shown. A second app shows the evidence behind labeled evaluation runs.

## Run locally

Install [proto](https://moonrepo.dev/proto) and start Docker with Compose. Run these commands from the repository root. The toolchain versions are pinned in [.prototools](.prototools).

```sh
proto install
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:up
```

The last two commands generate Prisma's client and start PostgreSQL with the checked-in migrations. Keep PostgreSQL running for both apps.

| To run                            | Commands from the root                                             | Open                                     |
| --------------------------------- | ------------------------------------------------------------------ | ---------------------------------------- |
| Fixture demo, no credentials      | `pnpm build:fixture`, then `pnpm start:fixture`                    | [Shopper](http://127.0.0.1:3000)         |
| Shopper with OpenAI and DummyJSON | `pnpm dev`                                                         | [Shopper](http://127.0.0.1:3000)         |
| Evaluation report                 | `pnpm evaluate`, then `pnpm dev:management` in a separate terminal | [Evaluation runs](http://127.0.0.1:3002) |

Choose one shopper process on port 3000. For live requests, set `OPENAI_API_KEY` in the server environment or in a private, gitignored `.env` at the workspace root. The first inference reads it. Building, opening history and using the fixture work without credentials. For production builds run `pnpm build`, then `pnpm start` and `pnpm start:management` in separate terminals. Next resolves a static service alias to the live or fixture implementation during the build. Their outputs are `.next` and `.next-fixture`.

Compose binds PostgreSQL to loopback port 55432 by default. Export matching `POSTGRES_PORT` and `POSTGRES_PASSWORD` to the processes if overriding the initial Compose settings. The Prisma adapter also accepts `DATABASE_URL`. Both apps and the evaluation runner need the same database to share results. `pnpm db:down` stops Compose and preserves the named volume.

## Architecture and framework choices

The shopper is a Next.js App Router app. The browser submits a turn with a stable ID and reads server-sent events from that HTTP POST. The server sends each verified product group as it becomes available. Prices, availability and coverage come from catalog observations and application templates. A single versioned product part drives the same React card during streaming and replay.

We’re keeping the Vercel AI SDK and the assignment model, `gpt-6-luna`, for structured intent and optional planning. A direct OpenAI client would leave the integration to translate structured responses into validated application events. The model and catalog interfaces let fixtures exercise the same HTTP handlers, PostgreSQL transactions and UI. The wire format is local, with one supported product presentation.

Conversation handling is starting to look like a workflow. A clear search goes straight to retrieval, while a broad category with relevant history can use a planning step to narrow the search or ask a clarifying question. If the narrowed search returns too few results, retrieval falls back to the broader category. The conversation service still owns allowed operations, timeouts and retries. These branches give us more reason to consider Mastra or LangChain if we need to resume at a specific step or start duplicating orchestration across flows. [Current architecture and eight journeys](docs/architecture.md)

## Shopper API contract

The OpenAPI specification defines five shopper operations, their JSON bodies and errors, and the events delivered by the two streaming POSTs. Edit the specification first, then run `pnpm api:generate` from the root and commit both generated modules with the contract change. Orval emits TanStack Query hooks for the browser and Zod schemas shared by the browser and HTTP handlers. Send and retry return the open HTTP response so the shopper can read each SSE frame as it arrives. [OpenAPI specification](apps/web/openapi.yaml) · [Generated modules](apps/web/src/api/generated)

`pnpm api:check` regenerates into a temporary directory and compares it with the working tree. It reports missing, changed and obsolete outputs. `pnpm check` includes this check. [Generator configuration](scripts/generate-api.mjs)

## How retrieval works

- A clear request such as “two fragrances under $50” goes straight to a known category. The application calls `GET /products/category/{slug}` or `GET /products/search?q=…` with `limit=20` and `skip`. It filters the observed category, keyword matches, stock and cent-based prices, ranks in the requested direction, and keeps the first snapshot per ID. “Under $50” excludes $50. “Up to $50” includes it.
- Discovery inspects at most three pages per group and shows up to ten products (three by default). Incomplete or inconsistent pagination is labeled partial, including when the service found zero matches. Even a complete scan reflects observations taken across separate requests.
- For a broad category such as “a few fragrances,” the planner may use up to five same-category turns from earlier chats in this shopper's scope. One batched model call can suggest a temporary keyword, a price-order preference or a clarifying question. Current constraints win. If a hinted search underfills, the remaining requests search the base category. With no relevant history, the category goes directly to discovery.
- “Something cheap and cool” calls for clarification. “A flight to Tokyo” gets catalog-scope guidance. Neither requires a catalog call. Up to three independent requests receive ordered groups, each with its own constraints. An ordinary catalog error becomes a group result, so the shopper can retry that group while keeping successful cards. Expiry of the shared retrieval deadline interrupts the whole attempt.
- A cheaper follow-up carries prior filters and searches strictly below the lowest displayed price in the referenced group. A named card supplies its own comparison price. A question about current price or stock uses `GET /products/{id}` after verifying that the product was shown in this chat. A replay uses the old snapshot. [Catalog adapter](packages/adapters/dummyjson/src/catalog.ts) · [Discovery rules](packages/features/product-discovery/src/application/discovery.ts)

## Conversation state and recovery

PostgreSQL gives the browser a durable, ordered history and both tabs one authority for in-flight work. Prisma persists threads, user turns, numbered attempts and one committed assistant message with its product snapshots. Transactions and a one-running-turn index protect a thread without holding a database lock during model or catalog calls. Client-generated IDs make repeated create and send requests idempotent. The URL `/conversations/<id>` reopens the thread.

The server emits `done` after the final write commits. If a stream disconnects, the client reads the stored turn. It replays a completed answer, polls an active attempt, or offers retry for the failed generation. An abandoned attempt expires after 90 seconds. A competing tab keeps its draft. Provider and catalog timeouts are bounded and automatic SDK retries are disabled.

A full or unavailable database can prevent even the failure state from being written. Visible previews are then unsaved. Restore storage and reload to reconcile the turn, allowing the lease to expire if needed. Invalid stored message data produces a thread-specific error. Clearing browser storage leaves previously saved conversations in PostgreSQL. Removing the PostgreSQL volume loses those records. The UI has no thread-deletion operation. [Storage contract](packages/adapters/evaluation-store/README.md)

## Verification and measured results

| Command                                | What it exercises                                                                                                                                                                                                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                            | Service-free Node tests for retrieval boundaries, history planning, turn ownership, retries, corrupt data, HTTP status codes and split SSE frames.                                                                                                                                     |
| `pnpm test:integration`                | Real PostgreSQL migration, two threads, ordered replay, follow-up and idempotent result import, and planner history for multiple same-category searches and a clarification alongside a successful lookup.                                                                             |
| `pnpm test:e2e`                        | Google Chrome sends a query, sees lookup progress while the fixture holds the catalog request, checks the card and image fallback, reloads after clearing browser storage, refines the search and reopens history. The running management app then reads a newly persisted evaluation. |
| `pnpm check`                           | OpenAPI generation drift, formatting, lint, TypeScript, React Doctor, Hallmark, Compose configuration, package tests, production builds and the database/browser journey.                                                                                                              |
| `pnpm evaluate` / `pnpm evaluate:live` | Record the nine-case fixture suite or the two-case live suite. The live suite consumes assignment API usage. Each command prints a management URL for its run.                                                                                                                         |

The integration and browser scripts create, migrate and drop a disposable database. The browser check needs installed Google Chrome and free ports 3174 and 3175. Each labeled case has its own history scope. The report shows the expected labels alongside observed decisions, queries and products. Execution errors and unscored dimensions are reported separately from semantic disagreements.

On 23 November 2026, one fresh PostgreSQL fixture run passed **9/9 cases**. Intent matched **9/9**, product constraints **7/7**, and abstention with zero catalog lookups **2/2**. First content took **6–28 ms**, total **7–32 ms**.

Before the security hardening, one live production turn returned one real product with one intent call, one catalog call and one reply call. First content took **4,527 ms**, total **6,712 ms**. A separate live production turn routed “a few fragrances” to the planner with one synthetic earlier search for light fragrances. It saved a clarification with zero catalog calls. First content took **6,233 ms**, total **8,517 ms**. First content measures server emission of the first result group or text, excluding status. History-informed live retrieval and live accuracy remain unmeasured. [Delivery handoff](PROJECT_STATUS.md#verified)

## Limits and next steps

This is a loopback application for one local shopper. Both shopper profiles share history when pointed at the same database. The deterministic fixture understands a limited set of phrases and products. The provider may interpret unfamiliar wording differently. The catalog offers text and category search with changing pages, and a capped scan can miss better matches. A snapshot stores image URLs, so image availability can change independently of saved text and prices. [Local security scope and verification](docs/security.md)

With another week, the first priorities would be a held-out set of real shopper paraphrases (including mixed and history-informed requests), a relevance review against a larger catalog sample, and repeated live measurements. The current browser case covers one desktop Chrome journey. Screen-reader and mobile-browser behavior need their own sessions.

## Source map

- [Applications](apps/README.md) · shopper UI and HTTP routes, evaluation dashboard.
- [Packages](packages/README.md) · feature-owned Zod schemas and rules, catalog and PostgreSQL adapters, shared UI.
- [Scripts](scripts/README.md) · evaluation and isolated database checks.
- [Repository tools](tools/README.md) · local lint rules.
- [Handoff and outstanding evidence](PROJECT_STATUS.md) · [Assignment](assignment/instructions.md).
