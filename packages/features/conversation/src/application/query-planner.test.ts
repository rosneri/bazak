import assert from "node:assert/strict";
import { test } from "node:test";
import { planGroups, type SearchGroup } from "@bazak/conversation/application/query-planner";
import type { AttemptMetrics } from "@bazak/conversation/domain/turn";
import { testRepository } from "#testing/repository";

const groups: SearchGroup[] = [
  { kind: "search", readiness: "ready", label: "Lamps", criteria: { keywords: "lamp", count: 2 } },
  {
    kind: "search",
    readiness: "needs-planning",
    label: "Fragrances",
    criteria: { category: "fragrances", maxPrice: 40 },
  },
  { kind: "clarify", label: "Gift", question: "Who is the gift for?" },
];

function metrics(): AttemptMetrics {
  return {
    intentCalls: 1,
    plannerCalls: 0,
    catalogCalls: 0,
    replyCalls: 0,
    queries: [],
    planner: [],
    firstVisibleMs: null,
    durationMs: 0,
  };
}

test("only the broad category receives up to five turns of structured shopping evidence", async () => {
  const { repository, conversation } = testRepository();
  const observed = metrics();
  const reads: string[] = [];

  const plans = await planGroups(
    groups,
    conversation.id,
    {
      ...repository,
      async relevantHistory(_id, category) {
        reads.push(category);

        return Array.from({ length: 10 }, () => ({
          criteria: [{ category: "fragrances", keywords: "citrus", maxPrice: 100 }],
          text: "Light citrus scents ".repeat(30),
        }));
      },
    },
    {
      async plan(inputs) {
        assert.deepEqual(
          inputs.map((i) => i.index),
          [1],
        );
        const [{ criteria, history }] = inputs;
        assert.equal(criteria.maxPrice, 40);
        assert.deepEqual(
          history,
          Array.from({ length: 5 }, () => ({
            keywords: "citrus",
            maxPrice: 100,
            priceOrder: undefined,
          })),
        );

        return [{ index: 1, kind: "hint", keywords: "citrus", priceOrder: null }];
      },
    },
    observed,
    new AbortController().signal,
  );

  assert.deepEqual(reads, ["fragrances"]);
  assert.equal(observed.plannerCalls, 1);
  assert.deepEqual(observed.planner, ["skipped", "used", "skipped"]);
  assert.deepEqual(plans.get(1)?.hint, { keywords: "citrus", priceOrder: null });
});

test("empty history skips the planner and an uncorrelated response falls back to the base category", async () => {
  const { repository, conversation } = testRepository();
  const empty = metrics();

  const planner = {
    async plan() {
      return [{ index: 0, kind: "clarify" as const }];
    },
  };

  assert.equal(
    (
      await planGroups(
        groups,
        conversation.id,
        repository,
        planner,
        empty,
        new AbortController().signal,
      )
    ).size,
    0,
  );
  assert.equal(empty.plannerCalls, 0);
  const invalid = metrics();

  const earlier = {
    ...repository,
    async relevantHistory() {
      return [{ criteria: [{ category: "fragrances" as const }], text: "Floral scents" }];
    },
  };

  assert.equal(
    (
      await planGroups(
        groups,
        conversation.id,
        earlier,
        planner,
        invalid,
        new AbortController().signal,
      )
    ).size,
    0,
  );
  assert.equal(invalid.planner[1], "fallback");
});

test("a term found only in older prose cannot become a catalog hint", async () => {
  const { repository, conversation } = testRepository();
  const observed = metrics();

  const plans = await planGroups(
    groups,
    conversation.id,
    {
      ...repository,
      async relevantHistory() {
        return [
          {
            criteria: [{ category: "fragrances" as const, keywords: "citrus" }],
            text: "Show me citrus perfumes. Gift note: blue notebook.",
          },
        ];
      },
    },
    {
      async plan([input]) {
        assert.equal(input.history[0].keywords, "citrus");
        assert.equal("text" in input.history[0], false);

        return [{ index: input.index, kind: "hint", keywords: "blue notebook", priceOrder: null }];
      },
    },
    observed,
    new AbortController().signal,
  );

  assert.equal(plans.size, 0);
  assert.equal(observed.planner[1], "fallback");
});
