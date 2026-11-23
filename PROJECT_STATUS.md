# Bazak local delivery handoff · 23 November 2026

The shopper, evaluation runner and management dashboard are implemented. The [README](README.md) covers setup, framework trade-offs, API choices and known limits. The [current architecture](docs/architecture.md) maps the running services and eight shopper journeys. The [drift report](docs/2026-11-23_DRIFT_REPORT.md) compares the repository with the design documents.

## Verified

- `pnpm check` passed, including formatting, lint, TypeScript, React Doctor, Hallmark, Compose configuration, package tests, production builds, an isolated PostgreSQL integration and the Google Chrome fixture journey.
- Chrome showed the first approved framing sentence while the fixture held the second. The shopper saw the card, received both sentences as one paragraph, cleared browser storage, reloaded, continued with a cheaper product and reopened the thread through history. Management displayed a scored row from a run created after the dashboard started.
- A separate two-tab Chrome check against private Compose PostgreSQL returned 409 for a competing turn and retained the second tab’s draft. Closing the first tab interrupted its work. Retrying the same user turn at generation two produced one committed assistant response. After restarting PostgreSQL and the shopper process, a fresh browser found both chats, the original card and identical saved history. All nine evaluation rows persisted.
- A PostgreSQL regression check retained two distinct same-category budgets from one earlier turn. A subsequent planner clarification saved its successful lamp sibling and issued just one catalog call. Only the lamp search entered future history. The migration rebuilding the derived index also applied to a populated fixture database.
- A fresh deterministic run passed 9/9 cases, with intent 9/9, product constraints 7/7 and correct abstention 2/2. Server first content ranged from 6–28 ms and total duration from 7–32 ms in that run. These ranges depend on the machine and database. Run `pnpm evaluate` to produce a current local report.
- One live production turn returned one real card using one intent call, one catalog request and one reply call. It reached first content in 4,527 ms and finished in 6,712 ms.
- A second live production turn sent “a few fragrances” in a fresh chat on a disposable PostgreSQL database. The intent model routed the category to planning. One same-scope history lookup supplied an earlier synthetic search for light fragrances, and the planner returned a clarification. The fragrance category was the sole current search criterion. The catalog query list was empty, with zero catalog requests and zero cards. One intent call, one planner call and one reply call produced a completed attempt that reloaded from PostgreSQL. First content took 6,233 ms and total duration was 8,517 ms. The separate two-case live suite and history-informed live retrieval remain unverified.
- The assignment credential is supplied via the server environment or the ignored root `.env`. Its local file permissions and exclusion from version control were checked without including the credential in the submission.

## Delivery scope

This is a locally runnable single-shopper submission. The fixture can run without API credentials. Live requests depend on the allowed OpenAI model and DummyJSON. Failure injection covers storage errors and corrupt payload handling. No physical disk-full event was required for those tests. Browser automation covers one desktop happy path. Relevance across unfamiliar real queries and accuracy across users remain unmeasured.

The author owns the final explanation and external submission. The [assignment](assignment/instructions.md) requests a repository link by 30 November 2026 at 23:59.
