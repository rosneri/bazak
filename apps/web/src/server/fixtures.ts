import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import {
  type ConversationModel,
  type ModelDecision,
  type ModelInput,
} from "@bazak/conversation/application/chat";
import type { QueryPlanner } from "@bazak/conversation/application/query-planner";
import type { Clock } from "@bazak/conversation/application/repository";
import type { ProductCatalog } from "@bazak/product-discovery/application/catalog";
import type { DiscoveryCriteria } from "@bazak/product-discovery/domain/discovery";
import { productSnapshotSchema } from "@bazak/product-discovery/domain/product";

const inventory = [
  {
    id: "f-rose",
    title: "Rose Water",
    description: "A dewy rose fragrance with soft green notes.",
    price: 34,
    category: "fragrances",
  },
  {
    id: "f-cedar",
    title: "Cedar Wood",
    description: "A dry cedar fragrance with a warm woody finish.",
    price: 42,
    category: "fragrances",
  },
  {
    id: "f-citrus",
    title: "Light Citrus",
    description: "A light citrus fragrance with lemon and bergamot notes.",
    price: 18,
    category: "fragrances",
  },
  {
    id: "f-amber",
    title: "Amber Resin",
    description: "A rich amber fragrance with a resinous finish.",
    price: 50,
    category: "fragrances",
  },
  {
    id: "l-desk",
    title: "Desk Lamp",
    description: "An adjustable lamp for a reading corner or workspace.",
    price: 29,
    category: "home-decoration",
  },
  {
    id: "l-floor",
    title: "Floor Lamp",
    description: "A freestanding lamp with a linen shade.",
    price: 62,
    category: "home-decoration",
  },
];

export function fixtureCatalog(clock: Clock): ProductCatalog {
  function snapshot(item: (typeof inventory)[number]) {
    return productSnapshotSchema.parse({ ...item, stock: 8, observedAt: clock().toISOString() });
  }

  return {
    async findPage({ source, offset, limit }, signal) {
      signal?.throwIfAborted();

      // oxlint-disable-next-line no-await-in-loop -- Browser verification holds the catalog response.
      while (existsSync(".next-fixture/hold-lookup")) await delay(35, undefined, { signal });

      const hits = inventory.filter((item) =>
        source.kind === "category"
          ? item.category === source.category
          : (item.title + " " + item.description)
              .toLowerCase()
              .includes(source.keywords.toLowerCase()),
      );

      return {
        products: hits.slice(offset, offset + limit).map(snapshot),
        total: hits.length,
        offset,
      };
    },
    async findById(id, signal) {
      signal?.throwIfAborted();
      const item = inventory.find((product) => product.id === id);

      return item ? snapshot(item) : null;
    },
  };
}

const counts = new Map([
  ["one", 1],
  ["a", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
]);

type Group = Extract<ModelDecision, { kind: "discover" }>["searches"][number];

function fixtureMinimum(text: string) {
  const match = text.match(/\b(above|over|more than|at least)\s*\$?\s*(\d+(?:\.\d+)?)/);

  if (!match) return;

  return {
    minPrice: Number(match[2]),
    minPriceBoundary: match[1] === "at least" ? ("inclusive" as const) : ("exclusive" as const),
  };
}

function interpretGroup(text: string): Group {
  const lamp = /lamp/.test(text);
  const fragrance = /fragrance|scent|perfume/.test(text);

  if (!lamp && !fragrance) return { kind: "clarify", reason: "gift" };
  const criteria: DiscoveryCriteria = { category: lamp ? "home-decoration" : "fragrances" };

  if (lamp) criteria.keywords = "lamp";

  if (fragrance && /\blight\b/.test(text)) criteria.keywords = "light";

  Object.assign(criteria, fixtureMinimum(text));

  const budget = text.match(/\b(under|below|up to|at most|less than)\s*\$?\s*(\d+(?:\.\d+)?)/);

  if (budget) {
    criteria.maxPrice = Number(budget[2]);
    criteria.priceBoundary = /up to|at most/.test(budget[1]) ? "inclusive" : "exclusive";
  }

  const count = text.match(
    /\b(one|two|three|four|five|\d+|a)\s+(?:light\s+)?(?:fragrance|scent|perfume|lamp)/,
  );

  if (count) criteria.count = counts.get(count[1]) ?? Number(count[1]);

  if (/cheapest|lowest price|ascending/.test(text)) criteria.priceOrder = "ascending";

  if (/most expensive|highest price|descending/.test(text)) criteria.priceOrder = "descending";

  return {
    kind: "search",
    criteria,
    readiness:
      criteria.minPrice !== undefined || budget || criteria.count || criteria.priceOrder
        ? "ready"
        : "needs-planning",
  };
}

function interpret({ text, history }: ModelInput): ModelDecision {
  const lower = text.toLowerCase();
  const visible = history.flatMap((turn) => turn.groups.flatMap((group) => group.products));
  const named = visible.find((product) => lower.includes(product.title.toLowerCase()));

  const minimum = fixtureMinimum(lower);

  if (minimum && !/fragrance|scent|perfume|lamp/.test(lower))
    return {
      kind: "replace-price",
      side: "minimum",
      amount: minimum.minPrice,
      boundary: minimum.minPriceBoundary,
    };

  if (/what categories|list categories/.test(lower)) return { kind: "off-catalog" };

  if (/cheaper/.test(lower)) return { kind: "cheaper", productId: named?.id ?? null };

  if (/stock|price (now|today)|current price/.test(lower) && (named || visible.length === 1))
    return { kind: "detail", productId: (named ?? visible[0]).id };

  if (/retry|try again/.test(lower)) {
    const failed = [...history]
      .reverse()
      .flatMap((turn) => turn.groups)
      .find(({ label, retryGroup }) => retryGroup !== null && lower.includes(label.toLowerCase()));

    return failed?.retryGroup != null
      ? { kind: "retry-group", group: failed.retryGroup }
      : { kind: "clarify", reason: "product" };
  }

  if (/weather|poem|politics|recipe|flight|plane ticket/.test(lower))
    return { kind: "off-catalog" };

  if (!/fragrance|scent|perfume|lamp/.test(lower)) return { kind: "clarify", reason: "product" };

  const groups = lower.split(/\s+and\s+(?=(?:one|two|three|a|an|some|\d+)\s)/).map(interpretGroup);

  if (
    groups.length > 3 ||
    groups.some((group) => group.kind === "search" && (group.criteria.count ?? 1) > 10)
  )
    return { kind: "clarify", reason: "limits" };

  return { kind: "discover", searches: groups };
}

const fixtureUsage = {
  model: "fixture",
  input: 0,
  output: 0,
  total: 0,
  cached: 0,
  written: 0,
  reasoning: 0,
  estimatedUsd: 0,
};

export const fixtureModel: ConversationModel = {
  async decide(input, signal, _prompt, usage) {
    usage?.(fixtureUsage);
    signal.throwIfAborted();

    return interpret(input);
  },
};

export const fixturePlanner: QueryPlanner = {
  async plan(groups, signal, _prompt, usage) {
    usage?.(fixtureUsage);
    signal.throwIfAborted();

    return groups.map(({ index, history }) => ({
      index,
      kind: "hint",
      keywords: history.some((entry) => entry.keywords === "light") ? "light" : null,
      priceOrder: null,
    }));
  },
};
