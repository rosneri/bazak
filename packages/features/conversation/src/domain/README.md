# Conversation domain

## Interface

[chat.ts](./chat.ts) defines text messages. [turn.ts](./turn.ts) defines create, send and retry input, conversation history, assistant parts, attempt measurements and streamed events.

## Invariants

An assistant message stores ordered `parts`. A `text` part carries plain text. A `products` part carries `version: 1` and one labeled `group` with its outcome, criteria, observed product snapshots, coverage and message. The same part appears in the live products event and the committed reply. Only a completed turn can contain a committed reply. A failed or interrupted turn can carry metrics with a null first-content time.

## Side effects

Schema parsing validates values in memory. Storage and transport live outside the domain.

## Verification

Run `pnpm --filter @bazak/conversation test`.
