import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  createConversationService,
  SAFE_FRAMING,
  type ConversationModel,
} from "@bazak/conversation/application/chat";
import {
  RepositoryError,
  type ConversationRepository,
} from "@bazak/conversation/application/repository";
import type { TurnEvent } from "@bazak/conversation/domain/turn";
import { createDiscoveryService } from "@bazak/product-discovery/application/discovery";
import type { ProductCatalog } from "@bazak/product-discovery/application/catalog";
import type { IntentDecision } from "@bazak/product-discovery/domain/discovery";
import { testRepository } from "#testing/repository";

const fragranceSearch = {
  kind: "search",
  label: "Fragrances",
  criteria: { category: "fragrances", maxPrice: 50, count: 2, priceBoundary: "exclusive" },
  readiness: "ready",
} as const;

const search: IntentDecision = { kind: "discover", searches: [fragranceSearch] };

const scents = [38, 29, 14].map((price, i) => ({
  id: String(i + 1),
  price,
  title: "Perfume " + (i + 1),
  description: "Fresh perfume",
  category: "fragrances",
  stock: 3,
  observedAt: "2026-11-23T12:00:00.000Z",
}));

const catalog: ProductCatalog = {
  async findPage() {
    return { total: scents.length, offset: 0, products: scents };
  },
  async findById(id) {
    const item = scents.find((p) => p.id === id);

    return item ? { ...item, price: 32, stock: 0 } : null;
  },
};

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

async function drain(stream: Promise<AsyncIterable<TurnEvent>>) {
  const events: TurnEvent[] = [];

  for await (const event of await stream) events.push(event);

  return events;
}

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
  assert.equal(first.find((e) => e.type === "text-delta")?.text, SAFE_FRAMING[0]);
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
          { ...fragranceSearch, label: "Lamps", criteria: { keywords: "lamp" } },
          fragranceSearch,
          { kind: "clarify", label: "Gift", question: "Who is the gift for?" },
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

      return { kind: "clarify", question: "What kind of product?" };
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
