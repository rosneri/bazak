# Bazak shopping copilot

The repository contains a Next.js App Router starter and the [assignment brief](assignment/instructions.md). The design notes below describe the proposed application.

The [architecture sketch](docs/architecture.md) maps the shopper journeys, domain models, service boundaries, and streaming infrastructure.

## Run locally

Install [proto](https://moonrepo.dev/proto) and Docker with Compose, then run these commands from the repository root.

```sh
proto install
pnpm install
pnpm db:up
pnpm dev
```

Open [localhost on port 3000](http://localhost:3000). The web starter runs independently of the database. For local development, connect to `postgresql://bazak:bazak_local@127.0.0.1:55432/bazak`. Use `POSTGRES_PORT` to change the host port or set `POSTGRES_PASSWORD` before initializing the volume. `pnpm db:down` stops the service and preserves its data.

## Development checks

`pnpm install` installs Lefthook and the project-local Hallmark design skill. On commit, Lefthook formats staged files with Oxfmt and stages the fixes. On push, it runs `pnpm check` across the workspace. Run that command locally to check formatting, lint, TypeScript, React Doctor, Hallmark's UI source checks, the Compose configuration, any workspace test scripts, and the production build.

Use `pnpm format` to format the workspace and `pnpm lint` for Oxlint with the 18 generic [anti-slop rules](https://github.com/dmmulroy/anti-slop/tree/c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b). React Doctor scans the full React project and blocks on warnings. The [Hallmark skill](https://github.com/Nutlope/hallmark/tree/04977e15f3dfd6ee4b74c887dac3eb52665d6c92/skills/hallmark) guides visual review as the UI develops. Its static checker runs with `pnpm ui:check`.

## Workspace layout

- `apps/*` contains deployable apps. `apps/web` owns the shopper interface, HTTP routes, and dependency wiring. The management app is planned for evaluation reporting.
- `packages/features/*` groups code by capability. Each feature owns its use cases and ports in `application` and its business rules and schemas in `domain`. Add `representation` for feature-specific view models or components and `infrastructure` for small, feature-local implementation details when needed. Chat turns and conversation management belong to the conversation feature.
- `packages/adapters/dummyjson` implements the product-discovery catalog port against the supplied DummyJSON contract. Adapters depend on feature-owned contracts, and apps wire their implementations into use cases.
- `packages/libraries/ui` owns the shared Tailwind CSS theme and shadcn/ui primitives. Import the Button from `@bazak/ui/components/button`. To add another primitive, run `pnpm dlx shadcn@4.23.0 add <component> -c packages/libraries/ui` from the repository root.
- `packages/libraries/*` holds reusable code shared across apps or features.

## Proposed architecture

The conversation feature defines the chat message and send-turn schemas and names OpenAI as the default provider. The planned web app composition will resolve that default to a Vercel AI SDK language model and inject the model into the chat turn. The fallback provider is optional and remains unset.

The proposed chat interface uses Google's A2UI for product widgets. Each chat turn uses an HTTP POST whose response streams server-sent events (SSE). PostgreSQL will store conversations and evaluation results. The initial design assumes a single local user and fetches catalog results on demand.

### Schemas and validation

Zod is the source of truth for runtime schemas and their TypeScript types. Each package that uses Zod declares `"zod": "catalog:"` to use the version pinned in the workspace. Follow the [working agreements](AGENTS.md) for schema and field metadata.

- **Domain models.** Each domain package owns its schemas and derives its types with `z.infer`. Creation, updates, and loading stored data all go through the domain schema. Put cross-field rules in refinements so every path enforces them. For example, a price range is valid only when its minimum is at most its maximum. [Zod parsing and type inference](https://zod.dev/basics)
- **AI responses.** The chat turn will supply a Zod output schema to the AI SDK for each structured response. Text can stream as it arrives. Before a structured result drives a catalog query, renders a product widget, or gets saved, the completed result must pass validation and any applicable domain rules. The turn will handle malformed or interrupted results as failures. [AI SDK structured output](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)

## Catalog operations

The assignment uses DummyJSON as the product catalog. Parameters in braces are part of the path. [Catalog API](https://dummyjson.com/products) · [Supplied OpenAPI specification](assignment/dummyjson_products_openapi.json)

| Path                        | Query parameters                             | Use in the copilot                                                    |
| --------------------------- | -------------------------------------------- | --------------------------------------------------------------------- |
| `/products/search`          | `q` (required), `limit`, `skip`              | Find candidates from a search term.                                   |
| `/products/category-list`   | None                                         | Get the valid category slugs.                                         |
| `/products/category/{slug}` | `limit`, `skip`                              | Browse a known category.                                              |
| `/products`                 | `limit`, `skip`, `select`, `sortBy`, `order` | Browse the catalog or request a price-ordered page.                   |
| `/products/{id}`            | None                                         | Look up a specific card or refresh its stored price and availability. |
| `/products/categories`      | None                                         | Get category display names, slugs, and URLs when a UI needs labels.   |

For a request like “show me two fragrances under $50,” the model could return a category, budget, and desired count. The application would validate the slug against the catalog, choose the category query, and apply the budget and stock rules to the results. The adapter would issue the request and validate the response. A bounded search should report whether it exhausted the candidates before claiming it found the cheapest item or that nothing matches.

## Decisions to discuss

- **Chat and widgets.** assistant-ui offers React primitives for the composer, message list, and thread selection. Its AI SDK runtime handles client-side conversation state, and a history adapter can load messages from our database. A2UI describes the product surface inside a message. A useful first test is whether a stored product widget renders again after a refresh without calling the model. [assistant-ui architecture](https://www.assistant-ui.com/docs/architecture) · [A2UI overview](https://a2ui.org/concepts/overview/)
- **Persistence.** The PostgreSQL schema still needs to account for ordered messages, retries, and a conversation cleared while a response is streaming. JSONB can hold the varying text and product-widget payloads. [PostgreSQL JSON types](https://www.postgresql.org/docs/current/datatype-json.html)
- **Retrieval and freshness.** A typed query builder can limit requests to known operations, the catalog host, and supported fields. The supplied spec exposes budget and stock as product data. Decide how many pages to inspect, when to ask the user for clarification, and when a historical product card should refresh.
- **Evaluation.** Use Vitest for query construction, domain rules, component tests, and adapter integration. Use Playwright to send a message, observe streaming and product cards, then reload and resume the conversation. For model evaluations, label expected intent and product constraints independently of the model being evaluated. Record constraint satisfaction, correct abstention, time to first output, and total latency by run. A local database can support a dashboard from these measurements.
