# Shopping copilot architecture

The shopper app serves chat and the evaluation app reads run evidence. Both use local PostgreSQL. Production and fixture builds of the shopper share the same conversation, discovery and storage code. The [delivery plan](delivery-plan.md) preserves the design inputs and the [standalone HTML diagram](architecture.html) includes the original drawings in a historical section.

## Code architecture

```mermaid
flowchart TB
  ui["Shopper browser · React"] -->|"JSON requests and POST/SSE"| route["Shopper routes · 3000"]
  route --> management["Create, list and load chats"]
  route --> turns["Send or retry turn"]
  turns -->|"Intent, optional planner, streamed framing"| model["Model ports"]
  model -->|"Production"| sdk["Vercel AI SDK · OpenAI gpt-6-luna"]
  model -->|"Fixture"| script["Scripted decisions and framing"]
  turns --> discovery["Discovery · criteria, coverage and ranking"]
  discovery --> catalog["ProductCatalog"]
  catalog -->|"Production"| dummy["DummyJSON"]
  catalog -->|"Fixture"| seed["Seeded products"]
  management --> repo["Scoped conversation repository"]
  turns --> repo
  repo --> db[("PostgreSQL · Prisma")]
  cli["Labeled evaluation CLI"] -->|"Isolated case scope"| turns
  cli -->|"Save evidence and independent scores"| db
  dashboard["Evaluation report · 3002"] -->|"Read run and case"| db
  ui --> cards["AssistantParts · text and v1 product groups"]
```

[Next configuration](../apps/web/next.config.ts) binds the service module at build time. [Composition](../apps/web/src/server/services.ts) injects the model, planner, clock and catalog into the feature services. The [SDK adapter](../apps/web/src/server/sdk.ts) owns provider-specific calls and validates their structured outputs. A ready search skips planning. For a broad category with relevant same-category history from other threads, the planner proposes a per-turn preference or clarifying question. With no evidence or an invalid proposal the service uses explicit criteria.

A card uses a local versioned message part, shared React primitives and a catalog snapshot. The browser renders the same part from a live event or a saved answer. General A2UI interoperability and a strategy for selecting among multiple card variants remain future possibilities.

## User journeys

### Start a conversation

```mermaid
flowchart LR
  click["Choose New chat"] --> create["Management creates a thread"]
  create --> store["Repository saves its ID"]
  store --> open["Open the empty thread"]
  open --> ready["Composer is ready"]
```

Creating a thread also makes it available in the history list. If creation fails, the UI keeps the current thread open and offers retry.

### Discover products

```mermaid
flowchart TD
  ask["Ask for two fragrances under $50"] --> intent["Resolve category, budget and count"]
  intent --> lookup["Discovery pages through the category"]
  lookup --> rank["Check price and stock, then rank"]
  rank -->|matches| cards["Show verified product cards and stream the reply"]
  rank -->|no matches| empty["Show zero matches and report scan coverage"]
  lookup -->|catalog unavailable| failed["Show a retryable lookup error"]
```

The search and category endpoints support pagination. Budget and stock filters run locally. The service marks a capped or inconsistent scan partial. Price ranking applies to observed matches, and the coverage message tells the shopper how much of the category was checked.

### Refine an earlier result

```mermaid
flowchart LR
  ask["Ask for a cheaper one"] --> context["Load prior criteria and referenced cards"]
  context --> resolve{"Reference clear?"}
  resolve -->|yes| revise["Carry forward category and revise the price limit"]
  revise --> search["Search again and append new results"]
  resolve -->|no| clarify["Ask which product the shopper means"]
```

The earlier cards keep the values shown in that turn. Fetch current details by product ID if a follow-up depends on today's price or availability.

### Clarify an ambiguous request

```mermaid
flowchart LR
  vague["Something cheap and cool"] --> question["Ask what kind of product they want"]
  question --> answer["Shopper answers: headphones under $40"]
  answer --> context["Combine both messages"]
  context --> discover["Run product discovery"]
```

### Handle an off-catalog request

```mermaid
flowchart LR
  ask["Find a flight to Tokyo"] --> scope["Classify as outside the product catalog"]
  scope --> reply["Explain the catalog's scope"]
  reply --> follow["Invite a catalog shopping request"]
```

The original request makes zero catalog calls. A later request for travel accessories starts a new discovery turn.

### Search for more than one thing

```mermaid
flowchart TD
  ask["Find a lamp under $60 and a chair under $100"] --> split["Keep one set of criteria per request"]
  split --> lamp["Search lamps with the $60 limit"]
  split --> chair["Search chairs with the $100 limit"]
  lamp --> reply["Return a labeled result group for each request"]
  chair --> reply
```

Each group carries its own matches, empty result, or lookup error. If the lamp search succeeds and the chair lookup fails, save both group outcomes in one completed reply. “Try chairs again” starts a new turn with only the chair criteria. The earlier lamp results remain available. This also applies to a single lookup error that the service successfully reports to the shopper. Expiry of the shared retrieval deadline interrupts the attempt and leaves earlier groups as unsaved previews.

### Reopen and continue a saved conversation

```mermaid
flowchart LR
  list["Open history"] --> select["Choose a saved thread"]
  select --> load["Management loads ordered messages"]
  load --> replay["Render saved text and product snapshots"]
  replay --> send["Send a follow-up in the same thread"]
```

A refresh opens the thread identified in the URL. Reading it requires only PostgreSQL, so reopening old messages works even when the catalog or model provider is unavailable.

### Recover from an interrupted reply

```mermaid
flowchart LR
  drop["Connection drops during a reply"] --> reopen["Reload the saved turn"]
  reopen --> status{"Stored state?"}
  status -->|completed| replay["Replay the committed answer"]
  status -->|still running| wait["Show progress and recheck"]
  status -->|failed or interrupted| retry["Offer retry on the same turn"]
```

The client supplies a stable turn ID. Repeated submission of that ID returns the saved status. An explicit retry of an interrupted turn starts a new attempt against the same user message. Only the current attempt can commit an answer. A bounded timeout lets an abandoned attempt become retryable.

If a second tab sends a different turn to a busy thread, the server rejects it as busy. The UI keeps the draft and can send it after the first turn finishes. Different conversations can run concurrently. Clearing browser storage leaves the server-side history available. The UI has no delete action.

## Persistence and streaming

```mermaid
erDiagram
  ShoppingThread ||--o{ ShoppingTurn : contains
  ShoppingTurn ||--|{ TurnAttempt : retains
  ShoppingTurn ||--o{ SearchEvidence : indexes
  EvaluationResult {
    uuid id
    uuid runId
    json expected
    json actual
  }
```

A thread contains ordered turns for one scope. Each logical turn stores stable user text and, on completion, its decision and one JSON assistant message with ordered parts. Each generation has a separate attempt row and lease. Search evidence indexes category-specific prior criteria, which other threads in the same scope can use. A labeled result stores its own evidence and scores. [Prisma schema](../packages/adapters/evaluation-store/prisma/schema.prisma)

A new turn streams its status, verified groups and approved text from one POST. The server validates a complete framing sentence before sending it. Adjacent text deltas become one saved paragraph. Only the current lease holder may commit the assistant reply. A successful write precedes the terminal `done` event. Failure after a preview produces an unsaved state and the client reconciles against PostgreSQL. A crashed process can leave timing and call metrics unknown for an expired attempt. [Conversation service](../packages/features/conversation/src/application/chat.ts) · [Browser recovery](../apps/web/src/client/chat-session.ts)

Model and catalog requests happen server-side during live turns. A browser can request an external image URL from a saved card. If the image disappears, the card retains the original product text, price and accessible image fallback. The PostgreSQL named volume survives restarts. The fixture browser journey uses no external requests. [Shopper transport and profiles](../apps/web/README.md) · [Verification and observations](../README.md#verification-and-measured-results)
