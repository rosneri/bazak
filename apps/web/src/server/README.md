# Shopper server composition

## Interface

[routes.ts](./routes.ts) injects the build-selected services and the [logger](./logger.ts) into [createConversationController](./http.ts). The controller owns request validation and JSON and SSE responses. [services.ts](./services.ts) composes management, discovery and turn execution. [SDK](./sdk.ts) supplies structured intent and query planning.

## Invariants

Both build profiles use the same controller, conversation service and PostgreSQL repository. The controller uses generated Zod schemas to validate request bodies, path identifiers, JSON responses and outgoing SSE payloads. Conversation domain schemas enforce business rules for stored history and emitted content. The controller maps application error codes to shopper-facing responses. Only a committed turn emits `done`. [OpenAPI specification](../../openapi.yaml)

The controller accepts HTTP requests addressed to `127.0.0.1` or `localhost` on the running shopper port. Writes check browser Fetch Metadata and compare Origin, or Referer when Origin is absent, with the selected loopback origin. Direct local clients can omit browser headers and send UTF-8 JSON. JSON-only writes and the absence of cross-origin grants also block browser requests that lack those headers. The local process assumes one shopper and has no global model-spend quota.

Every write requires an uncompressed JSON body of at most 64 KiB, received within ten seconds of route handling. The controller checks the declared length and counts received bytes while reading. It returns a JSON error before initializing storage or model services if a request fails these checks. The shopper API bypasses Next Proxy so the controller can read the original stream without waiting for a clone to buffer the upload.

## Side effects

[Production](./services.production.ts) calls OpenAI and DummyJSON. [Fixture](./services.test.ts) uses seeded catalog and scripted models. A fixture-only file gate can hold a catalog lookup until the browser shows its loading state.

Client cancellation aborts in-progress application work and releases the event iterator. Server-side HTTP failures and terminal stream failures produce one error log with the operation, phase, code and HTTP status when available. Routine 4xx responses and normal client cancellation do not produce error logs.

## Verification

Run `pnpm --filter @bazak/web test` from the workspace root.
