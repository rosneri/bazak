# Conversation application

## Interface

`createConversationManagement(repository, clock)` creates, lists and loads conversations for the repository's shopper scope. `createConversationService` accepts the same repository and clock, a catalog discovery service and two model ports. The web composition root injects implementations of those ports for each build profile.

## Invariants

1. `send` or `retry` acquires a numbered attempt before returning its event stream. A duplicate acquires no work. A completed duplicate emits its saved answer.
2. The intent call receives up to eight recent completed turns. Each shopper and assistant excerpt is limited to 500 characters. A cheaper comparison preserves the prior filters and uses the least expensive displayed card, or a specifically named card. A refresh requires a previously displayed ID.
3. A ready search goes straight to discovery. For eligible broad categories, the planner reads up to five earlier turns per category with their grouped, successful search criteria from other chats in this scope. Only categories with evidence enter one planner call. Its preferences can prioritize products or ask a question for one group. An invalid proposal falls back to the current criteria.
4. Each group becomes a versioned part immediately. All prices, stock, counts and coverage statements come from application data. The model can stream two approved framing sentences. Each complete sentence becomes a text delta. Contiguous deltas are saved as one passage. Unrecognized text is discarded, and the service consumes the response to its end to detect a provider failure.
5. Completion writes the validated reply, decision and timings through the repository. A late attempt cannot overwrite another. A failed stream ends with an error and can be retried using the observed attempt number.

The lease lasts 90 seconds. Intent, planning, retrieval and framing also have stage deadlines of 20, 8, 25 and 25 seconds. The service records model and catalog operations as they start, including calls which fail. Time to first content excludes the status event. The database adapter owns transactions and scope isolation.

## Side effects

The service invokes model, catalog and repository ports. Database transactions are short and end before model or catalog calls. Caller cancellation or a deadline aborts work.

## Verification

Run `pnpm --filter @bazak/conversation test`.
