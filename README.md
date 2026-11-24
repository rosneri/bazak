# Bazak shopping copilot

Bazak is a local shopping assistant for the DummyJSON catalog. Ask for “two fragrances under $50” and the reply shows product cards with a title, description, price and image. Ask “Show me a cheaper one” to refine the search. Each conversation has its own URL, and reopening a chat shows the products and prices you originally saw.

[Run locally](#run-locally) · [Architecture](#architecture-and-framework-choices) · [Retrieval](#how-retrieval-works) · [State and recovery](#conversation-state-and-recovery) · [Evaluation](#verification-and-measured-results) · [Limitations](#known-limitations-and-next-steps)

## Run locally

Install [proto](https://moonrepo.dev/proto) and start Docker with Compose. From the repository root, install the pinned Node.js, pnpm and moon versions, generate the Prisma client, and start and migrate PostgreSQL.

```sh
proto install
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:up
```

**Try the demo without credentials.** The fixture uses a scripted model and a small, fixed catalog behind the same shopper UI and database as the live app.

```sh
pnpm build:fixture
pnpm start:fixture
```

1. Open the [shopper](http://127.0.0.1:3000), select **New chat**, and send **Find two fragrances under $50**. Look for Rose Water ($34) and Cedar Wood ($42).
2. Send **Show me a cheaper one.** The fixture returns Light Citrus ($18).
3. Reload the page, start another chat, then reopen the fragrance conversation from **Saved chats**. Both answers and their cards should still be there.

**Use the live model and catalog.** Stop the fixture shopper to free port 3000. Set `OPENAI_API_KEY` in the server environment or in the gitignored `.env` at the repository root, then run `pnpm dev`. Open the same shopper URL. Live searches use the assignment model, `gpt-6-luna`, and current DummyJSON inventory.

**Inspect an evaluation.** Run `pnpm evaluate` to save a credential-free fixture report, then run `pnpm dev:management` and open the [dashboard](http://127.0.0.1:3002). Select the saved run to compare expected intent and constraints with actual queries and products. The dashboard’s **Run evaluations** button also runs live suites and uses API credits.

PostgreSQL listens on loopback port 55432 by default. Point the shopper, dashboard and evaluation runner at the same database. If you customize Compose, export matching `POSTGRES_PORT` and `POSTGRES_PASSWORD` settings. The Prisma adapter also accepts `DATABASE_URL`. Run `pnpm db:down` to stop PostgreSQL and keep the volume. For production builds, run `pnpm build`, then run `pnpm start` and `pnpm start:management` in separate terminals.

## Architecture and framework choices

Next.js App Router serves the React chat and its HTTP endpoints in one process. The Vercel AI SDK asks OpenAI for a structured intent decision and, when useful, a search plan. Zod validates the proposal. The conversation service resolves references to earlier cards, chooses a permitted catalog operation, and verifies the returned products before presenting them.

The browser reads server-sent events from the turn’s HTTP POST. It shows lookup progress while DummyJSON is working and can display the first group while a second search is pending. The application builds summaries from observed results. In a single-group search, the final group is committed before delivery and its summary is progressively revealed in the browser. Streaming and replay use the same product-card representation. [Turn response](packages/features/conversation/src/application/turn-response.ts) · [Browser streaming test](tests/search-summary.spec.ts)

Two alternatives shaped that choice.

- **Direct OpenAI client.** Intent and planning each have a different output schema. Using the SDK’s structured-output interface lets both share the same validation pattern and keeps provider response handling in one adapter. Direct calls would leave us maintaining that mapping for both paths. [Model adapter](apps/web/src/server/sdk.ts)
- **Mastra.** A workflow engine could checkpoint each step. Here a retry already has a precise unit of work in PostgreSQL, one numbered attempt on the original shopper turn. Adding a workflow runtime would require reconciling its execution state with the attempt that owns the visible reply. Resuming a costly search halfway through, or sharing the same workflow across features, would justify revisiting this choice. [Architecture and shopper journeys](docs/architecture.md)

The shopper API has five operations. Its OpenAPI contract generates TanStack Query hooks and Zod schemas. After changing the contract, run `pnpm api:generate` and commit the generated files. `pnpm api:check` checks for drift. [Shopper API](apps/web/openapi.yaml) · [Generated client](apps/web/src/api/generated)

## How retrieval works

| Shopper request                                             | Catalog operation and behavior                                                                                                                                                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| “Two fragrances under $50”                                  | A recognized category selects `GET /products/category/fragrances`. The app checks stock, applies the strict price ceiling in cents and limits the result count. “Up to $50” includes an item priced at exactly $50.                     |
| A product term without a known category                     | `GET /products/search?q=<keywords>` searches for terms grounded in the shopper’s message. Local filtering checks returned products against the requested constraints.                                                                   |
| “Something cheap and cool”                                  | Ask which kind of product the shopper wants. A clarification costs no catalog request.                                                                                                                                                  |
| “A flight to Tokyo”                                         | Explain the available shopping actions and skip the catalog lookup.                                                                                                                                                                     |
| “A lamp under $60 and two fragrances under $40”             | Split up to three independent requests into ordered groups with separate criteria. If the lamp lookup fails, the shopper can retry that group and keep the fragrance results. A shared retrieval timeout interrupts the entire attempt. |
| “Show me a cheaper one” or “What does Rose Water cost now?” | A cheaper search carries forward the referenced filters and uses a strict upper bound from the displayed prices. A current-price or stock question resolves a previously shown product ID and fetches `GET /products/{id}`.             |

List requests use `limit=20` and `skip` for pagination. Each group can inspect three pages and show up to ten products, with three as the default. The app deduplicates by product ID and ranks the observed matches. A capped or inconsistent scan is labeled partial even if it returns zero matches. This keeps latency bounded and makes the scope of “cheapest” visible. [DummyJSON API specification](assignment/dummyjson_products_openapi.json) · [Catalog adapter](packages/adapters/dummyjson/src/catalog.ts) · [Discovery rules](packages/features/product-discovery/src/application/discovery.ts)

For a broad request such as “a few fragrances,” the planner can draw on up to five same-category turns in this shopper’s history. It may suggest a keyword, prefer a price order or ask a question. Explicit constraints take precedence. If a hinted query finds too few products, the remaining page budget goes to the base category. With no relevant history the app searches the category directly.

## Conversation state and recovery

PostgreSQL stores threads, shopper turns, numbered attempts and committed assistant messages, including product snapshots. This gives two tabs one authority on which attempt owns a turn and lets a refresh replay historical prices without contacting OpenAI or DummyJSON. The trade-off for local setup is a database container. The browser keeps pending submission IDs and text in session storage until the server acknowledges them.

| What happens                                | What the shopper sees                                                                                                                                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A connection drops or two tabs send at once | On reconnect, the client reads the stored turn, replays a completed answer, polls an active attempt or offers retry. Stable IDs prevent duplicate submissions. A competing tab keeps its draft. An abandoned attempt expires after 90 seconds. |
| PostgreSQL fills up or goes offline         | A final write can fail even after cards appear. Those previews are unsaved. Restore database capacity or connectivity and reload to reconcile the turn before retrying.                                                                        |
| A saved message is malformed                | Validation produces a thread-specific error. Repair or restore the damaged record to recover that history.                                                                                                                                     |
| The shopper clears browser storage mid-turn | Committed messages survive in PostgreSQL. The browser can lose a pending draft and its retry ID. Reopen the thread to see whether the server accepted the message. Removing the database volume itself loses the saved history.                |

## Verification and measured results

| Command                                      | What it checks                                                                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm test`                                  | Service-free tests for budgets, ranking, planning, retry ownership, corrupt data, HTTP errors and split event frames.                                                                            |
| `pnpm test:integration`                      | Migrations and persistence against disposable PostgreSQL, including ordered replay, planning history and idempotent evaluation imports.                                                          |
| `pnpm test:e2e`                              | Chrome submits chat messages, sees progress and cards, reloads and refines a saved chat, and reopens it through history. Recovery cases drop acknowledgments before and after server acceptance. |
| `pnpm evaluate` / `pnpm evaluate:harness`    | Score the fixed fixture cases or exercise scripted intent proposals against a fixed catalog, including multi-turn scenarios.                                                                     |
| `pnpm evaluate:model` / `pnpm evaluate:live` | Exercise the live model against a fixed catalog or the production adapters against DummyJSON. Both use assignment API credits.                                                                   |
| `pnpm check`                                 | Run contract, formatting, lint, type, UI, build, database and browser checks together.                                                                                                           |

The integration and browser commands create, migrate and drop their own local database. Browser checks need Google Chrome and free ports 3174 and 3175. A regression that accepts a $50 item for “under $50,” drops a card on reload or duplicates a turn after a lost acknowledgment has a deterministic check. A valid-looking intent for an unfamiliar paraphrase can still be wrong.

On 24 November 2026, the PostgreSQL integration check passed. Two Chrome runs each passed eight of nine tests, including the walkthrough above and the lost-acknowledgment cases. The single-search summary test timed out both times waiting to observe a partial summary alongside the cards. That preview behavior remains unverified. [Summary test](tests/search-summary.spec.ts)

On 23 November 2026, a recorded fixture run passed all nine cases, including seven product-constraint checks and two cases requiring zero catalog lookups. Two historical live turns exercised a real product lookup and a history-informed clarification. Those runs give examples of behavior, but the sample is too small to estimate live relevance or reliability. [Recorded results and timings](PROJECT_STATUS.md#verified) · [Manual failure and recovery checks](docs/2026-11-23_MANUAL_VALIDATION.md)

## Known limitations and next steps

- **Relevance.** A three-page scan can miss a better or cheaper product farther down the catalog. With another week, I’d compare the returned cards with a full catalog sample and measure how often a larger page budget changes the top results.
- **Language and context.** The deterministic fixture recognizes a limited vocabulary. I’d build a held-out set of real paraphrases, especially mixed requests and follow-ups after a price refresh, and score both the chosen operation and the returned products across repeated live runs.
- **Local use.** Everyone who can reach the app shares one shopper history. The app binds to loopback and has no authentication or user isolation. Saved cards retain their original text and price, but an image URL may stop working. Browser automation covers Chrome. Mobile browsers and screen-reader navigation need separate testing. [Local security scope](docs/security.md)

## Repository guide

- [Shopper app](apps/web/README.md) and [evaluation dashboard](apps/management/README.md)
- [Domain packages and adapters](packages/README.md) and [evaluation scripts](scripts/README.md)
- [Assignment brief](assignment/instructions.md) and [delivery evidence](PROJECT_STATUS.md)
