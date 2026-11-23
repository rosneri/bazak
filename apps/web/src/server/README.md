# Shopper server composition

## Interface

[routes.ts](./routes.ts) injects the build-selected services into [conversationHandlers](./http.ts). [services.ts](./services.ts) composes management, discovery and turn execution. [SDK](./sdk.ts) supplies structured intent, planner and streamed reply ports.

## Invariants

Both build profiles use the same conversation service and PostgreSQL repository. Requests and events use domain schemas. Only a committed turn emits done.

## Side effects

[Production](./services.production.ts) calls OpenAI and DummyJSON. [Fixture](./services.test.ts) uses seeded catalog and scripted models. A fixture-only file gate can hold the second approved sentence until the browser sees the first.

## Verification

Run `pnpm --filter @bazak/web test` from the workspace root.
