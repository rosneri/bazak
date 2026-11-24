# Conversation application

## Interface

`createConversationManagement(repository, clock)` creates, lists and loads conversations for the repository's shopper scope. `createConversationService` accepts the same repository and clock, a catalog discovery service and two model ports. The web composition root injects implementations of those ports for each build profile.

## Invariants

1. `send` or `retry` acquires a numbered attempt before returning its event stream. A duplicate acquires no work. A completed duplicate emits its saved answer.
2. The intent call receives up to eight completed turns from the current chat. It gets short shopper excerpts, group summaries and card references for follow-ups. The application checks chosen IDs and failed-group references against those turns. A cheaper comparison preserves the authorized prior filters and uses the least expensive displayed card or the named card.
3. The application selects clarification wording and group labels. It accepts normalized keyword phrases drawn from the current request, including simple English plurals. A known catalog category can still be used for a synonym or translation. A ready search goes straight to discovery. Eligible broad categories can use one planner call with structured shopping preferences from up to five earlier same-category turns in this shopper's scope. The planner can reuse a witnessed earlier search term for that group, suggest a soft price order, or select a product-preference question. Unrecognized terms fall back to the current criteria.
4. Each group becomes a versioned part immediately. All prices, stock, counts and coverage statements come from application data.
5. Completion writes the validated reply, decision and timings through the repository. A late attempt cannot overwrite another. A failed stream ends with an error and can be retried using the observed attempt number.

The lease lasts 90 seconds. Intent, planning and retrieval have stage deadlines of 20, 8 and 25 seconds. The service records model and catalog operations as they start, including calls which fail. Time to first content excludes the status event. The database adapter owns transactions and scope isolation.

## Side effects

The service invokes model, catalog and repository ports. Database transactions are short and end before model or catalog calls. Caller cancellation or a deadline aborts work.

## Verification

Run `pnpm --filter @bazak/conversation test`.
