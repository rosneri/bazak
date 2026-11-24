import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  createConversationService,
  SAFE_FRAMING,
  type ContextTurn,
  type ConversationEvent,
  type ConversationModel,
  type ModelDecision,
} from "@bazak/conversation/application/chat";
import {
  RepositoryError,
  type ConversationRepository,
} from "@bazak/conversation/application/repository";
import { createDiscoveryService } from "@bazak/product-discovery/application/discovery";
import type { CatalogQuery, ProductCatalog } from "@bazak/product-discovery/application/catalog";
import { catalog, scents } from "#testing/catalog";
import { testRepository } from "#testing/repository";

const fragranceSearch = {
  kind: "search",
  criteria: { category: "fragrances", maxPrice: 50, count: 2, priceBoundary: "exclusive" },
  readiness: "ready",
} as const;

const search: ModelDecision = { kind: "discover", searches: [fragranceSearch] };

interface Options {
  decide?: ConversationModel["decide"];
  reply?: ConversationModel["reply"];
  products?: ProductCatalog;
  storage?: Partial<ConversationRepository>;
}

function setup(options: Options = {}) {
  const { repository, clock, conversation, turns } = testRepository();

  const model: ConversationModel = {
    decide: options.decide ?? (async () => search),
    reply:
      options.reply ??
      async function* () {
        yield "Here’s what ";
        yield "I found.";
      },
  };

  const service = createConversationService({
    repository: { ...repository, ...options.storage },
    clock,
    model,
    discovery: createDiscoveryService(options.products ?? catalog),
    queryPlanner: {
      async plan() {
        throw new Error("Unexpected planning request");
      },
    },
  });

  const send = (text: string, turnId = randomUUID(), signal?: AbortSignal) =>
    service.send(conversation.id, { turnId, text }, signal);

  return { service, id: conversation.id, turns, send };
}

async function drain(stream: Promise<AsyncIterable<ConversationEvent>>) {
  const events: ConversationEvent[] = [];

  for await (const event of await stream) events.push(event);

  return events;
}

test("a price-only follow-up replaces the ceiling and retains the category and count", async () => {
  const products = [49.99, 100, 100.01, 120, 130].map((price, i) => ({
    ...scents[0],
    id: String(i),
    price,
  }));

  const chat = setup({
    products: {
      ...catalog,
      async findPage() {
        return { offset: 0, total: products.length, products };
      },
    },
    async decide({ history }) {
      if (!history.length) return search;
      assert.deepEqual(history.at(-1)?.groups[0].criteria, fragranceSearch.criteria);

      return { kind: "replace-price", side: "minimum", amount: 100, boundary: "exclusive" };
    },
  });

  await drain(chat.send("Two fragrances under $50"));
  const events = await drain(chat.send("now above 100$"));
  const result = events.find((event) => event.type === "products")?.part.group;
  assert.deepEqual(result?.criteria, {
    category: "fragrances",
    count: 2,
    minPrice: 100,
    minPriceBoundary: "exclusive",
  });
  assert.deepEqual(
    result?.products.map((product) => product.price),
    [100.01, 120],
  );
});

test("a shopper can compare cheaper scents, replay the original prices and refresh a sold-out card", async () => {
  const chat = setup({
    async decide({ text }) {
      if (text.includes("cheaper")) return { kind: "cheaper", productId: null };

      if (text.includes("stock")) return { kind: "detail", productId: "1" };

      return search;
    },
  });

  const turnId = randomUUID();
  const first = await drain(chat.send("Two fragrances under $50", turnId));
  const next = await drain(chat.send("Is there a cheaper one?"));
  const detail = await drain(chat.send("Is Perfume 1 in stock?"));
  const group = first.find((e) => e.type === "products")?.part.group;
  assert.deepEqual(
    group?.products.map((p) => p.price),
    [38, 29],
  );
  assert.deepEqual(
    next.find((e) => e.type === "products")?.part.group.products.map((p) => p.price),
    [14],
  );
  assert.equal(detail.find((e) => e.type === "products")?.part.group.products[0]?.stock, 0);
  assert.equal(
    first.flatMap((e) => (e.type === "text-delta" ? [e.text] : [])).join(""),
    SAFE_FRAMING[0],
  );
  const replay = await drain(chat.send("Two fragrances under $50", turnId));
  assert.deepEqual(
    replay.map((e) => e.type),
    ["status", "done"],
  );
  assert.deepEqual(replay.at(-1), first.at(-1));
});

test("one unavailable catalog group and a vague gift do not hide the successful fragrance cards", async () => {
  const chat = setup({
    async decide() {
      return {
        kind: "discover",
        searches: [
          { ...fragranceSearch, criteria: { keywords: "lamp" } },
          fragranceSearch,
          { kind: "clarify", reason: "gift" },
        ],
      };
    },
    products: {
      ...catalog,
      async findPage(query, signal) {
        if (query.source.kind === "search") throw new Error("Catalog unavailable");

        return catalog.findPage(query, signal);
      },
    },
    async *reply() {
      yield "Every item costs exactly $1.";
    },
  });

  const stream = await drain(chat.send("A lamp, two scents and a gift"));
  assert.deepEqual(
    stream.flatMap((e) => (e.type === "products" ? [e.part.group.kind] : [])),
    ["lookup-error", "matched", "clarify"],
  );
  assert.equal(stream.at(-1)?.type, "done");
  assert.equal(chat.turns[0].metrics?.catalogCalls, 2);
  assert.equal(
    stream.some((e) => e.type === "text-delta"),
    false,
  );
});

test("vague, off-catalog and unseen product-detail requests make no catalog calls", async () => {
  const chat = setup({
    async decide({ text }) {
      if (text.includes("flight")) return { kind: "off-catalog" };

      if (text.includes("price")) return { kind: "detail", productId: "999" };

      return { kind: "clarify", reason: "product" };
    },
  });

  await drain(chat.send("something cheap and cool"));
  await drain(chat.send("a flight to Tokyo"));
  await drain(chat.send("what is the price of product 999?"));
  assert.deepEqual(
    chat.turns.map((t) => t.decision?.kind),
    ["clarify", "off-catalog", "clarify"],
  );
  assert.ok(
    chat.turns.every(
      (t) =>
        t.metrics?.catalogCalls === 0 && t.metrics.plannerCalls === 0 && t.metrics.replyCalls === 0,
    ),
  );
});

test("catalog searches use witnessed product terms or a known category", async () => {
  const sources: CatalogQuery["source"][] = [];

  const chat = setup({
    async decide() {
      return {
        kind: "discover",
        searches: [
          { ...fragranceSearch, criteria: { keywords: "blue notebook" } },
          { ...fragranceSearch, criteria: { category: "fragrances", keywords: "blue notebook" } },
          { ...fragranceSearch, criteria: { keywords: "DESK lamp" } },
        ],
      };
    },
    products: {
      ...catalog,
      async findPage(query) {
        sources.push(query.source);

        return { products: [], total: 0, offset: 0 };
      },
    },
  });

  const events = await drain(chat.send("Show me scents and Desk Lamps."));
  assert.deepEqual(sources, [
    { kind: "category", category: "fragrances" },
    { kind: "search", keywords: "desk lamp" },
  ]);
  const groups = events.flatMap((event) => (event.type === "products" ? [event.part.group] : []));
  assert.deepEqual(
    groups.map(({ label, kind }) => [label, kind]),
    [
      ["Product search", "clarify"],
      ["Fragrances", "empty"],
      ["Desk lamp", "empty"],
    ],
  );
  assert.equal(groups[0]?.message, "What kind of product are you looking for?");
  assert.equal(events.at(-1)?.type, "done");
});

function assertRetryableLampGroups(history: ContextTurn[]) {
  const [turn] = history;
  assert.deepEqual(Object.keys(turn).sort(), ["groups", "text"]);
  assert.deepEqual(
    turn.groups.map(({ label, retryGroup }) => [label, retryGroup]),
    [
      ["Desk lamp", 0],
      ["Floor lamp", 1],
    ],
  );
}

test("only failed groups in the projected thread context can be retried", async () => {
  let catalogCalls = 0;

  const chat = setup({
    async decide({ text, history }) {
      if (text.includes("Try")) {
        assertRetryableLampGroups(history);

        return { kind: "retry-group", group: text.includes("floor") ? 1 : 2 };
      }

      return {
        kind: "discover",
        searches: ["desk lamp", "floor lamp"].map((keywords) => ({
          ...fragranceSearch,
          criteria: { category: "home-decoration", keywords },
        })),
      };
    },
    products: {
      ...catalog,
      async findPage() {
        catalogCalls++;

        if (catalogCalls <= 2) throw new Error("Catalog unavailable");

        return { products: [], total: 0, offset: 0 };
      },
    },
  });

  await drain(chat.send("Find desk lamps and floor lamps."));
  const retry = await drain(chat.send("Try the floor lamps again."));
  const group = retry.find((event) => event.type === "products")?.part.group;
  assert.equal(group?.criteria?.keywords, "floor lamp");
  assert.equal(group?.kind, "empty");

  const unknown = await drain(chat.send("Try another group again."));
  assert.equal(
    unknown.find((event) => event.type === "text-delta")?.text,
    "Which previous product lookup should I try again?",
  );
  assert.equal(catalogCalls, 3);
});

test("an interrupted provider leaves a preview, and retry saves one answer under the original message", async () => {
  let firstAttempt = true;

  const chat = setup({
    async *reply() {
      yield SAFE_FRAMING[0];

      if (firstAttempt) {
        firstAttempt = false;
        throw new Error("Provider stream ended early.");
      }
    },
  });

  const turnId = randomUUID();
  const preview = await drain(chat.send("two fragrances", turnId));
  assert.ok(preview.some((e) => e.type === "products"));
  assert.equal(preview.at(-1)?.type, "error");
  assert.equal(chat.turns[0].assistant, null);
  assert.equal(chat.turns[0].metrics?.firstVisibleMs, 0);
  const retry = await drain(chat.service.retry(chat.id, turnId, 1));
  assert.equal(retry.at(-1)?.type, "done");
  assert.equal(chat.turns.length, 1);
  assert.equal(chat.turns[0].attempt, 2);
});

test("closing a stream after the first cards marks the attempt interrupted", async () => {
  const chat = setup();
  const controller = new AbortController();
  const stream = await chat.send("Two scents", randomUUID(), controller.signal);

  for await (const e of stream) {
    if (e.type === "products") {
      controller.abort();
      break;
    }
  }

  assert.equal(chat.turns[0].state, "interrupted");
  assert.equal(chat.turns[0].assistant, null);
});

test("a rejected completion produces a recoverable error after the preview", async () => {
  const chat = setup({
    storage: {
      async finish() {
        throw new RepositoryError("storage_unavailable");
      },
    },
  });

  const stream = await drain(chat.send("Two fragrances"));
  assert.ok(stream.some((e) => e.type === "products"));
  assert.equal(stream.at(-1)?.type, "error");
  assert.equal(
    stream.some((e) => e.type === "done"),
    false,
  );
});

test("approved sentence prefixes stream as they arrive and replay as one passage", async () => {
  const chat = setup({
    async *reply() {
      yield "Here’s what ";
      yield "I found. A bottle costs $17. Would you ";
      yield "like to narrow the search?";
    },
  });

  const turnId = randomUUID();
  const stream = await drain(chat.send("Two fragrances", turnId));
  assert.deepEqual(
    stream.flatMap((event) => (event.type === "text-delta" ? [event.text] : [])),
    ["Here’s what", " I found.", " Would you", " like to narrow the search?"],
  );
  const replay = await drain(chat.send("Two fragrances", turnId));
  const done = replay.find((event) => event.type === "done");
  assert.deepEqual(
    done?.assistant.parts.filter((part) => part.type === "text"),
    [{ type: "text", text: SAFE_FRAMING.join(" ") }],
  );
});
