# Shopper API client and schemas

Edit `openapi.yaml`, then run `pnpm api:generate` from the workspace root. Commit the specification with the generated hooks and Zod schemas. Run `pnpm api:check` to compare the checked-in files with fresh generator output. [OpenAPI specification](../../openapi.yaml) · [Generated hooks](./generated/hooks.ts) · [Generated Zod schemas](./generated/models.ts)

The browser uses TanStack Query hooks for list, create, load, send, and retry. The fetch adapters validate JSON and return the open `Response` for SSE. The stream reader validates each decoded event as it arrives. The HTTP controller imports the generated Zod schemas directly. [Fetch adapters](./fetch.ts) · [Stream reader](../client/stream.ts) · [HTTP controller](../server/http.ts)
