# Goldfish comprehension review

This historical review records design-stage findings. See the [current handoff](../PROJECT_STATUS.md) for delivery status.

An independent reader reviewed the [architecture sketch](architecture.md) without the planning conversation. The paraphrase and findings below refer to the first draft. The disposition records the changes made afterward.

## What this proposes

A shopper can search a catalog, refine earlier results, and reopen a saved conversation. A conversation service uses a model to interpret each turn. Product discovery validates the criteria, searches the catalog, and returns snapshots for the UI. The browser can show cards and text before the answer is saved. A completion event tells it the answer is durable.

## How the existing system works, per this document

The repository has a Next.js and TypeScript starter, shared UI primitives, Zod, quality checks, and PostgreSQL in Docker Compose. The conversation service, catalog search, product cards, and replay flows are proposed. The team has selected HTTP POST with an SSE response and deferred choosing different components for different product kinds.

## Findings and disposition

| Severity | Finding from the first draft                                                                                                            | Change to the sketch                                                                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Major    | A failed chair lookup alongside successful lamp results left the completion state and retry scope unclear.                              | A saved reply records both group outcomes. A follow-up retry searches only for chairs. Stream recovery retries an interrupted turn using its stable ID.                 |
| Major    | Two tabs could submit different turns to the same thread. Stable turn IDs alone did not explain what happened to the second submission. | The design allows one active turn per conversation. A competing send receives a busy response and retains its draft.                                                    |
| Major    | Clearing a thread invalidated late responses, but the history list and old URL had unspecified behavior.                                | Browser storage can be cleared independently of server history. An explicit app-level clear would remove the thread and make its URL point the shopper back to history. |
| Minor    | The diagram named A2UI without explaining how a saved result selected a card.                                                           | Live and replayed product parts use the same versioned mapping to a registered card.                                                                                    |
