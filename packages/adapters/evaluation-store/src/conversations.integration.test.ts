import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { createFixtureServices } from "../../../../apps/web/src/server/services.test.ts";
import { composeServices } from "../../../../apps/web/src/server/services.ts";
import { fixtureCatalog, fixtureModel } from "../../../../apps/web/src/server/fixtures.ts";
import { fixtureCases } from "@bazak/evaluations/cases";
import { observe, score } from "@bazak/evaluations/evaluate";
import { evaluationResultSchema } from "@bazak/evaluations";
import { createConversationRepository } from "./conversations.ts";
import { database } from "./client.ts";
import { readRun, saveResults } from "./results.ts";

after(() => database.$disconnect());

test("two threads reload in order and a labeled fixture result persists with its evidence", async () => {
  assert.ok(
    process.env.DATABASE_URL,
    "Set DATABASE_URL to an isolated migrated local test database.",
  );
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname !== "/bazak",
    "Use a dedicated local test database.",
  );
  const runId = randomUUID();
  const scope = "integration/" + runId;
  const services = createFixtureServices(createConversationRepository(scope));
  const old = randomUUID();
  const current = randomUUID();
  await services.management.create(old);
  await services.management.create(current);
  const expected = fixtureCases[1];
  const first = { turnId: randomUUID(), text: expected.prompt };
  const second = { turnId: randomUUID(), text: "Show me a cheaper one." };

  async function submit(message: typeof first) {
    const stream = await services.chat.send(current, message);
    const events = [];

    for await (const event of stream) events.push(event.type);
    assert.deepEqual([events[0], events.at(-1)], ["status", "done"]);
  }

  await submit(first);
  await submit(second);

  const reopened = createFixtureServices(createConversationRepository(scope));
  assert.deepEqual(
    (await reopened.management.list()).map((thread) => thread.id),
    [current, old],
  );
  const history = await reopened.management.load(current);
  assert.deepEqual(
    history.turns.map((turn) => turn.turnId),
    [first.turnId, second.turnId],
  );
  const turn = history.turns[0];
  assert.ok(turn.metrics);
  const actual = observe(turn);
  assert.deepEqual(
    actual.groups[0].products.map((product) => product.id),
    ["f-rose", "f-cedar"],
  );

  const result = evaluationResultSchema.parse({
    id: randomUUID(),
    runId,
    profile: "fixture",
    outcome: "observed",
    caseName: expected.name,
    recordedAt: new Date().toISOString(),
    expected,
    actual,
    ...score(expected, actual),
    firstOutputMs: turn.metrics.firstVisibleMs,
    durationMs: turn.metrics.durationMs,
  });

  assert.equal(await saveResults([result]), 1);
  assert.equal(await saveResults([result]), 0);
  assert.deepEqual(await readRun(runId), [result]);

  const groupedPrompt = "Show me one light fragrance under $50 and one fragrance under $18.";
  await submit({ turnId: randomUUID(), text: groupedPrompt });
  const repository = createConversationRepository(scope);
  const evidence = await repository.relevantHistory(old, "fragrances");
  assert.equal(evidence[0].text, groupedPrompt);
  assert.deepEqual(
    evidence[0].criteria.map((criteria) => criteria.maxPrice),
    [50, 18],
  );

  const clock = () => new Date();

  const planning = composeServices(
    repository,
    fixtureModel,
    {
      async plan(groups) {
        assert.deepEqual(
          groups.map((group) => group.index),
          [0],
        );

        return [{ kind: "clarify", index: 0, question: "Which fragrance notes do you prefer?" }];
      },
    },
    fixtureCatalog(clock),
    clock,
  );

  const mixed = await planning.chat.send(old, {
    turnId: randomUUID(),
    text: "Show me a few fragrances and one lamp under $40.",
  });

  const events = [];

  for await (const event of mixed) events.push(event);
  assert.equal(events.at(-1)?.type, "done");
  const [resolved] = (await planning.management.load(old)).turns;
  assert.deepEqual(
    observe(resolved).groups.map((group) => group.kind),
    ["clarify", "matched"],
  );
  assert.equal(resolved.metrics?.catalogCalls, 1);
  assert.deepEqual(await repository.relevantHistory(current, "fragrances"), []);
  const lamps = await repository.relevantHistory(current, "home-decoration");
  assert.equal(lamps[0].criteria[0].keywords, "lamp");
});
