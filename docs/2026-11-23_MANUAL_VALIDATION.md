# Bazak manual validation · 23 November 2026

This manual fixture run tested `main` at `7c0dc07` against the eight [shopper journeys](architecture.md#user-journeys) and the [evaluation dashboard](../apps/management/README.md). We used real Google Chrome 157 and a disposable PostgreSQL 18 Compose project with separate databases for the ordinary, recovery and fault-injection walks. Chrome drove the normal shopper and management UI. Reloads and new browser contexts checked which results persisted. Transport responses and stored attempt evidence supplement the browser observations where noted. All model and catalog calls stayed within the local fixture.

Seven journeys met the criteria exercised, and discovery had one count discrepancy in the fixture. “Find two cheapest fragrances under $50” displayed three cards, even though “Find two fragrances under $50” displayed two. The fixture’s nine labeled cases all passed. The suite does not cover that wording. The two-tab recovery check also found a stale busy notice after Send became available. The fixture used the same success-sounding copy after an empty or failed lookup.

## Shopper journeys

Thread identifiers below are prefixes of the captured `/conversations/<uuid>` URLs from the disposable databases. Prompts provide the reproduction steps.

### 1. Start a conversation

**Passed.** “New chat” opened an empty thread with its own URL and enabled composer. The thread appeared in history and reopened by URL. Aborting one creation request in a dedicated browser context left the original conversation onscreen with “Couldn’t confirm the saved chat. Check the connection and try again.” Clicking “New chat” again sent the same requested thread UUID, returned HTTP 201 and opened the empty thread. The creation and reload checks used thread `01b8d7cc`. The failed request and retry used `4ab706a5`.

### 2. Discover products

**Count discrepancy.** “Find two fragrances under $50” returned Rose Water ($34) and Cedar Wood ($42), with “All catalog pages for this lookup were checked.” The cards had prices, descriptions and accessible image fallbacks. “Find two fragrances under $18” returned “No matches found. All catalog pages for this lookup were checked.” Light Citrus costs exactly $18. Adding “cheapest” to the $50 request showed Light Citrus ($18), Rose Water ($34) and Cedar Wood ($42), in price order. The two-card reply (`892ea4a1`) and the empty result (`7c39870b`) each replayed on reload. The three-card defect is recorded in `53e4214c`.

**Failure and partial scan.** In the separate fault build, `Find a lamp under $60` saved and replayed the Lamps lookup error in thread `5a304887`. `Please retry the lamps` recovered Desk Lamp ($29) while preserving the earlier error. A deliberately inconsistent fragrance page offset caused both the $50 result and the $18 empty result to say “Only part of the catalog was checked. There may be more matches.” Thread `8007d4d5`. The fixture appended “Here’s what I found. Would you like to narrow the search?” after both the zero-result and standalone error replies, even though neither displayed a product card.

### 3. Refine an earlier result

**Passed.** After the two-fragrance result, both “Find something cheaper” and “Find something cheaper than Rose Water” yielded Light Citrus ($18) in a new reply. Earlier cards remained unchanged after reload. With two possible product groups, an unnamed cheaper request asked “Which product or group would you like a cheaper alternative to?” Asking for Rose Water’s current price displayed “The catalog currently lists this item at $34.00 with 8 in stock.” Threads `892ea4a1` (refinement and current detail) and `b722a526` (clarification after “Find a lamp under $60 and two fragrances under $40”) both replayed on reload.

### 4. Clarify an ambiguous request

**Passed.** “Something cheap and cool” elicited “What kind of product are you looking for?” with no cards. “Two fragrances under $40” then yielded Rose Water ($34) and Light Citrus ($18). Reload preserved the original clarification and both cards. Thread `f3f51233`.

### 5. Handle an off-catalog request

**Passed.** “Find a flight to Tokyo” displayed “I can help you find products in the catalog. What would you like to shop for?” without cards. “Find a lamp under $60” then returned Desk Lamp ($29) in the same thread. Reload preserved both replies. Thread `0273be44`.

### 6. Search for more than one thing

**Passed.** “Find a lamp under $60 and two fragrances under $40” displayed a Lamps group with Desk Lamp ($29) and a Fragrances group with Rose Water ($34) and Light Citrus ($18). Moving the fragrance limit to $10 kept the Desk Lamp and produced a fragrance no-match message. In a separate build with one injected lamp lookup failure, the reply saved two fragrance cards and a Lamps group stating “The catalog lookup failed. You can ask to try this group again.” “Please retry the lamps” added Desk Lamp ($29) in a Lamps-only reply. Reload preserved the earlier successful and failed groups and the targeted retry. The standard second prompt was `Find a lamp under $60 and two fragrances under $10`. Both ordered replies survived reload in thread `7dda4c50`. The injected-failure prompt was “Find two fragrances under $40 and a lamp under $60” in thread `862ce1fe`.

**Shared retrieval deadline.** With the same fragrance-first prompt and the lamp adapter held until cancellation, the fragrance group was visible in Chrome by 81 ms while the lamp lookup was pending. By 25,275 ms Chrome displayed “Attempt 1 failed. You can retry this message.” and “Retry reply.” The fragrance cards were in a “Reply preview” article with the status “Unsaved preview.” Reload removed the preview and kept Retry. Removing the adapter delay and retrying completed both groups, which replayed on reload with a single shopper message. The stored attempts show attempt 1 failed after 25,052 ms and attempt 2 completed. Thread `c015779a`.

### 7. Reopen and continue a saved conversation

**Passed.** History reopened the same thread URL and ordered reply cards. Clearing browser storage and reloading preserved the saved conversation. At 390 px in a fresh touch context, the History drawer reopened the thread and closed without horizontal overflow. “Find something cheaper than Cedar Wood” added Light Citrus ($18). Reload kept the two ordered shopper messages and original cards. The desktop and emulated iPhone 13 visits reopened thread `01b8d7cc`.

**Dependency outage.** Navigating directly to thread `5a304887` reopened the saved reply with Desk Lamp ($29) while the fixture’s model and catalog ports were both configured to throw. The control prompt `Find two fragrances under $40` then failed at model interpretation and offered “Retry reply” while the saved card stayed visible.

### 8. Recover from an interrupted reply

**Passed.** A separate fixture instance held the final sentence. Chrome showed Desk Lamp ($29), “Here’s what I found.” and “Reply in progress…” Reload interrupted the stream and showed “Attempt 1 interrupted. You can retry this message.” with zero saved assistant parts. “Retry reply” returned HTTP 200. After reload and a fresh GET, the same turn was completed on attempt 2 with exactly one shopper message, one product card and one assistant paragraph. The held prompt was “A lamp under $60” in thread `b6094f3f`, turn `5c118ecf`.

### Count mismatch reproduction

1. Start the fixture shopper and open a new thread.
2. Send `Find two cheapest fragrances under $50`.
3. The Fragrances group says “Showing 3 matching products” and displays three cards. The requested count is two.
4. In a new thread, send `Find two fragrances under $50`. The group displays two cards.

The [fixture intent parser](../apps/web/src/server/fixtures.ts) recognizes ascending ordering from “cheapest.” Its count pattern expects the product term after the number, with “light” as the optional modifier. With “cheapest” in that position, the emitted criteria omit the requested count. Persisted decisions confirm ascending price order and no count for the three-card turn, and count 2 for the control. Production handling of this wording was outside this fixture check.

### Cross-conversation planning

Seeded “Find two light fragrances under $40” in one chat, then sent “Find a few fragrances” in a new chat. The second reply (`ea28d4cc`) said “Products matching ‘light’ were prioritized” and ordered Light Citrus, Rose Water, Cedar Wood. A fresh database control (`7f7d1880`) with the same broad prompt ordered Rose Water, Cedar Wood, Light Citrus and showed no preference label. Stored attempt metrics recorded one planner call, a `light` keyword lookup and a category fallback for the later broad prompt (`ea28d4cc`). The fresh control had zero planner calls and one category lookup.

### Saved evidence and two-tab recovery

- The completed vague request and flight request each recorded zero catalog calls in PostgreSQL. The mixed-group turn recorded two catalog calls. In the fault run, the same saved turn contained the successful Fragrances group and failed Lamps group, and the targeted retry recorded one home-decoration lookup. The catalog adapter log directly showed the injected failure and the single lookup on retry.
- The Rose Water detail turn stored `productId: f-rose` and one catalog call. The separate fault-profile adapter log captured `findById f-rose`.
- A separate thread (`061c2440`) held `One fragrance under $40` while another tab tried to send `Two fragrances under $40`. A newly opened tab rendered the saved user message with “Reply in progress…” and automatically replayed the answer after release. A second tab submitted a different turn during the hold and received HTTP 409 `thread_busy`. Its draft stayed intact. After the first turn finished, Send was available and resubmission returned HTTP 200. Both ordered messages and answers survived reload. The busy notice remained visible beside the enabled Send control until the second submission.

## Management

- On a newly migrated database, “No evaluation runs yet” displayed with instructions to run `pnpm evaluate`.
- The supported CLI saved fixture run `4869972c-8d1e-4751-99bb-1881666863b2`. The dashboard showed nine **Passed** rows. Every row’s timings matched CLI output. First output ranged from 6 to 47 ms and total duration from 7 to 50 ms. The dashboard displayed intent **9/9**, product constraints **7/7**, and correct abstention **2/2**. Each denominator counts the labeled cases applicable to that metric.
- “Open run” reached the saved run URL. The Strict budget case (`2361909c`) showed the prompt `Show me two fragrances under $50.`, expected and observed `discover`, Rose Water ($34) and Cedar Wood ($42). It recorded one catalog call, 13 ms to first output and 15 ms total. The evidence disclosure exposed the saved labels and observed JSON. The Outside the catalog case showed expected and observed `off-catalog`, zero catalog calls, a passing abstention check, 6 ms to first output and 7 ms total. That labeled case asks “What is the weather tomorrow?”
- Closing case evidence returned to the run. Reloading kept the selected case, and opening the product case’s deep link in a fresh Chrome context reproduced the same report and score denominators. An unknown UUID displayed “Run not found,” and “Open the latest run” recovered to the saved report.
- A second fixture run (`672da6e5-0624-4a57-b15d-2434bc1cd4be`) also passed all nine cases and became the default. Selecting the first run restored its original case timings. Clear product search showed 47 ms to first output and 50 ms total on the first run and 50 ms and 59 ms on the second. The selected first run survived reload.
- An independent report instance used a local relay to simulate loss of PostgreSQL connectivity. It showed “Evaluation storage is unavailable.” Restoring the relay and clicking “Reload report” recovered all nine saved cases on the same instance.

## Scope and reproduction

Run the checked-in Compose service with a unique project name and a free loopback database port. Set that same database for migrations, the shopper, the dashboard and `pnpm evaluate`. Follow the [fixture setup](../README.md#run-locally). The test environment blocked Turbopack’s child process listener. We built the shopper with Turbopack worker threads and the management app with webpack. Use the fixture’s existing `.next-fixture/hold-reply` seam to pause the final sentence in an isolated shopper instance. For the standalone and mixed lookup failures, inject a one-shot error at the lamp catalog port in an isolated build. For the partial coverage state, return a fragrance page offset different from the requested offset. To exercise the shared deadline, wait for the retrieval abort signal inside the lamp lookup. To verify stored replay during dependency failure, make the model and catalog ports throw while the database remains reachable. For the management storage check, interrupt only that report instance’s connection to the disposable database.

The fixture uses scripted interpretation, seeded product records and the same conversation service, HTTP routes and storage as production. The fixture covers lamps and fragrances, so the clarification, off-catalog follow-up and mixed-query checks used those categories. The images were fixture fallbacks. Production provider interpretation, catalog pagination and ranking, production latency, the page-cap branch, crashing the process and full lease expiry remain outside this fixture walk.
