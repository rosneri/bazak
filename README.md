# Bazak shopping copilot

The repository contains a Next.js App Router starter and the [assignment brief](assignment/instructions.md). The design notes below describe the proposed application.

## Run locally

From the repository root, use pnpm to install the workspace dependencies and start the web app.

```sh
pnpm install
pnpm dev
```

Open [localhost on port 3000](http://localhost:3000). Run `pnpm typecheck` for the TypeScript 7 check or `pnpm build` for a production build.

## Proposed architecture

- `apps/web` hosts the Next.js frontend, HTTP routes, and the code that wires the adapters together.
- `packages/models/*` groups code by domain, starting with product discovery and conversations. Business rules are pure functions. Each domain can expose its React components through a separate presentation entry point.
- `packages/providers/*` holds adapters for the catalog, intent classification, and answer generation. The two model adapters can share an OpenAI client while exposing distinct operations.
- `packages/libraries/*` holds low-level clients and generated API types. Orval can generate a server-side client from the supplied DummyJSON OpenAPI spec. To generate React Query hooks for the app's own conversation endpoints, define those endpoints in a separate API contract. [Orval React Query guide](https://orval.dev/docs/guides/react-query/)

The proposed stack uses the Vercel AI SDK for model calls and streaming, and Google's A2UI for product widgets. A local database in Docker will store conversations. The initial design assumes a single local user and fetches catalog results on demand.

## Catalog operations

The supplied [OpenAPI specification](assignment/dummyjson_products_openapi.json) defines these GET operations. Parameters in braces are part of the path.

| Path | Query parameters | Use in the copilot |
| --- | --- | --- |
| `/products/search` | `q` (required), `limit`, `skip` | Find candidates from a search term. |
| `/products/category-list` | None | Get the valid category slugs. |
| `/products/category/{slug}` | `limit`, `skip` | Browse a known category. |
| `/products` | `limit`, `skip`, `select`, `sortBy`, `order` | Browse the catalog or request a price-ordered page. |
| `/products/{id}` | None | Look up a specific card or refresh its stored price and availability. |
| `/products/categories` | None | Get category display names, slugs, and URLs when a UI needs labels. |

For a request like “show me two fragrances under $50,” the model could return a category, budget, and desired count. The adapter would validate the slug, fetch the category, then apply the budget and stock rules to the results. A bounded search should report whether it exhausted the candidates before claiming it found the cheapest item or that nothing matches.

## Decisions to discuss

- **Streaming.** A chat turn can use one HTTP POST whose response streams text and product data as server-sent events (SSE). The response stays open until that turn finishes. WebSockets would be worth revisiting for a feature that needs ongoing, two-way communication. [AI SDK stream protocols](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
- **Chat and widgets.** assistant-ui offers React primitives for the composer, message list, and thread selection. Its AI SDK runtime handles client-side conversation state, and a history adapter can load messages from our database. A2UI describes the product surface inside a message. A useful first test is whether a stored product widget renders again after a refresh without calling the model. [assistant-ui architecture](https://www.assistant-ui.com/docs/architecture) · [A2UI overview](https://a2ui.org/concepts/overview/)
- **Persistence.** MongoDB fits independently stored messages with variable payloads. PostgreSQL also supports those payloads through JSONB and makes it straightforward to group evaluation runs by conversation and outcome. The first storage design should account for ordered messages, retries, and a conversation cleared while a response is streaming. [PostgreSQL JSON types](https://www.postgresql.org/docs/current/datatype-json.html)
- **Retrieval and freshness.** A typed query builder can limit requests to known operations, the catalog host, and supported fields. The supplied spec exposes budget and stock as product data. Decide how many pages to inspect, when to ask the user for clarification, and when a historical product card should refresh.
- **Evaluation.** Use Vitest for query construction, domain rules, component tests, and adapter integration. Use Playwright to send a message, observe streaming and product cards, then reload and resume the conversation. For model evaluations, label expected intent and product constraints independently of the model being evaluated. Record constraint satisfaction, correct abstention, time to first output, and total latency by run. A local database can support a dashboard from these measurements.
