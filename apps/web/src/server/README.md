# Shopper server composition

## Interface

[routes.ts](./routes.ts) injects the build-selected services and the [logger](./logger.ts) into [createConversationController](./http.ts). The controller owns request validation and JSON and SSE responses. [services.ts](./services.ts) composes management, discovery and turn execution. [SDK](./sdk.ts) supplies structured intent, planner and streamed reply ports.

## Invariants

Both build profiles use the same controller, conversation service and PostgreSQL repository. Requests and outgoing SSE events use domain schemas. The controller maps application error codes to shopper-facing responses. Only a committed turn emits `done`.

## Side effects

[Production](./services.production.ts) calls OpenAI and DummyJSON. [Fixture](./services.test.ts) uses seeded catalog and scripted models. A fixture-only file gate can hold the second approved sentence until the browser sees the first.

Client cancellation aborts in-progress application work and releases the event iterator. Server-side HTTP failures and terminal stream failures produce one error log with the operation, phase, code and HTTP status when available. Routine 400, 404 and 409 responses and normal client cancellation do not produce error logs.

## Verification

Run `pnpm --filter @bazak/web test` from the workspace root.
