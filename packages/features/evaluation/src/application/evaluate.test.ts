import assert from "node:assert/strict";
import { test } from "node:test";
import { fixtureCases, type EvaluationCase } from "@bazak/evaluations/cases";
import type { Observation } from "@bazak/evaluations";
import { score } from "@bazak/evaluations/evaluate";
import type { ProductSnapshot } from "@bazak/product-discovery/domain/product";
import type { ResultGroup } from "@bazak/conversation/domain/turn";

const metrics = {
  intentCalls: 1,
  plannerCalls: 0,
  catalogCalls: 1,
  queries: [],
  planner: [],
  firstVisibleMs: 20,
  durationMs: 25,
};

const product: ProductSnapshot = {
  id: "f-rose",
  title: "Rose Water",
  description: "floral fragrance",
  price: 34,
  stock: 4,
  category: "fragrances",
  observedAt: "2026-11-23T12:00:00.000Z",
};

const group: ResultGroup = {
  kind: "matched",
  label: "Fragrances",
  criteria: { category: "fragrances" },
  coverage: "exhaustive",
  message: "Observed two matches.",
  products: [product, { ...product, id: "f-cedar", price: 42 }],
};

const actual: Observation = {
  decision: {
    kind: "discover",
    searches: [
      {
        kind: "search",
        label: "Fragrances",
        readiness: "ready",
        criteria: { category: "fragrances" },
      },
    ],
  },
  groups: [group],
  metrics,
};

const expected = fixtureCases[1];

test("scores independent relevance, exact count, stock and an exclusive budget", () => {
  assert.equal(score(expected, actual).constraintsSatisfied, true);

  for (const change of [{ price: 50 }, { stock: 0 }, { id: "l-desk" }, { id: "f-cedar" }]) {
    assert.equal(
      score(expected, {
        ...actual,
        groups: [{ ...group, products: [{ ...product, ...change }, group.products[1]] }],
      }).constraintsSatisfied,
      false,
    );
  }
});

test("a missing requested group and an unexpected empty search fail the constraints", () => {
  assert.equal(score(fixtureCases[8], actual).constraintsSatisfied, false);
  assert.equal(
    score(expected, { ...actual, groups: [{ ...group, kind: "empty", products: [] }] })
      .constraintsSatisfied,
    false,
  );
});

test("an explicitly empty search requires complete evidence", () => {
  const empty = { ...group, kind: "empty", products: [] } satisfies ResultGroup;
  assert.equal(score(fixtureCases[2], { ...actual, groups: [empty] }).constraintsSatisfied, true);
  assert.equal(
    score(fixtureCases[2], { ...actual, groups: [{ ...empty, coverage: "partial" }] })
      .constraintsSatisfied,
    false,
  );
});

test("an abstention needs the expected intent and zero catalog lookups", () => {
  const off: Observation = {
    decision: { kind: "off-catalog" },
    groups: [],
    metrics: { ...metrics, catalogCalls: 0 },
  };

  assert.equal(score(fixtureCases[7], off).correctAbstention, true);
  assert.equal(score(fixtureCases[7], { ...off, metrics }).correctAbstention, false);
  assert.equal(score(fixtureCases[6], off).correctAbstention, false);
});

test("an ascending sort, expected planner call and actual hinted query are scored independently", () => {
  const labeled: EvaluationCase = {
    ...expected,
    groups: [{ ...expected.groups[0], order: "ascending" }],
    plannerCalls: 1,
    queryTerm: "light",
  };

  assert.equal(score(labeled, actual).constraintsSatisfied, false);

  const planned: Observation = {
    ...actual,
    metrics: {
      ...metrics,
      plannerCalls: 1,
      queries: [{ source: { kind: "search", keywords: "light" }, offset: 0, limit: 20 }],
    },
  };

  assert.equal(score(labeled, planned).constraintsSatisfied, true);
  assert.equal(
    score(labeled, { ...planned, groups: [{ ...group, products: [...group.products].reverse() }] })
      .constraintsSatisfied,
    false,
  );
});
