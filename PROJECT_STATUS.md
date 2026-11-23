# Bazak project status · 2026-11-23

## Resume after context compression

Keep work on `main` and make one reviewed, completed change per commit. The parent agent only orchestrates. Delegate implementation and verification to distinct task-specific subagents, selecting an efficient model and reasoning effort for each. Resume the unfinished working-tree changes only after compression.

## Completed foundation

- The baseline has the [assignment brief](assignment/instructions.md), [DummyJSON OpenAPI contract](assignment/dummyjson_products_openapi.json), and a local Next.js App Router starter with TypeScript 7. [Proto](.prototools) pins Node and pnpm. [Docker Compose](compose.yaml) provides PostgreSQL with a named volume.
- [Oxlint](.oxlintrc.json) and [Oxfmt](.oxfmtrc.json) supply lint and formatting, including the 18 generic Backstage anti-slop rules in the local Oxlint plugin. [Lefthook](lefthook.yml) formats staged files on commit and runs workspace checks on push. The [README](README.md) records the React Doctor and Hallmark checks.
- The [shared UI package](packages/libraries/ui/package.json) provides the shared Tailwind theme and shadcn Button. The workspace pins Zod and the [schema policy](README.md#schemas-and-validation) makes executable schemas the source of inferred types and boundary validation. The lean [agent guide](AGENTS.md) records working agreements.
- The [Elephant–Goldfish architecture sketch](docs/architecture.md) and its [HTML version](docs/architecture.html) cover eight shopper journeys, domain ownership, code boundaries, and POST/SSE delivery. The [comprehension review](docs/comprehension_report.md) records the earlier design review.

## Uncommitted work in progress

These paths are local to the original working tree.

- The management app (`apps/management/package.json`) has Next.js, TypeScript, PostCSS, and shadcn configuration and is configured for port 3002. The application directory has no dashboard pages.
- The evaluation feature (`packages/features/evaluation`) contains a draft Zod result and batch schema. The evaluation store (`packages/adapters/evaluation-store/package.json`) has a partial Prisma setup, including its PostgreSQL schema (`packages/adapters/evaluation-store/prisma/schema.prisma`), config, client wiring, and locally generated client. Migration, repository, and importer are still pending. There are no tested evaluation results at this checkpoint.
- Root manifests, lockfile, and ignore rules contain matching WIP. The root already defines management and Prisma commands and an import command whose target is still missing. Review this slice before treating those commands as a runnable setup.

## Remaining work and priority

1. **Contracts and dependency wiring.** Define the conversation, turn, message, discovery, and product Zod schemas. Agree on narrow ports and service factory signatures, then select production and deterministic test dependency profiles at build time. Keep profile selection free of runtime environment branching and DI containers. Production configuration can still read connection settings and secrets from the environment.
2. **Wire catalog, storage, and model dependencies once those contracts are stable.** Implement PostgreSQL repositories and migrations, including idempotent turns, transactional completion and replay, and recovery from failed or interrupted attempts. Build bounded retrieval over the paginated DummyJSON adapter. Resolve and inject the Vercel AI SDK model during app composition. The chat turn belongs to the conversation feature and will use OpenAI's `gpt-6-luna` for intent and replies, with any fallback currently unset. Let application logic select permitted catalog operations and enforce constraints. Finish the evaluation repository and import path alongside the conversation persistence work.
3. **Deliver one complete shopper flow.** Wire discovery, conversation turns, and conversation management for create, list, and resume. Stream text, verified product cards, and durable completion over the response to an HTTP POST. Replay saved messages and product snapshots after refresh. Add one registered product presentation first. Defer product-component selection to a future Strategy in the UI.
4. **Verify, evaluate, and prepare the submission.** Exercise the input-to-product-to-rendering path, ambiguity and off-catalog requests, multi-intent partial failures, interruption and retry, refresh, and storage failure. Use labeled evaluation cases and capture separate quality and latency measures. Build the local results dashboard over persisted runs. Verify a fresh local setup and record what was exercised, observed limitations, and gaps.

The assignment asks for a locally runnable source submission by **30 November 2026 at 23:59**. The user owns the choices and final README in their own words. Preserve enough evidence for them to explain the selected stack and at least two concrete framework alternatives, catalog endpoints and retrieval trade-offs, persistence and failure behavior, evaluation coverage and blind spots, and what another week would improve. Keep the supplied API key out of source control. See the [original instructions](assignment/instructions.md).
