import assert from "node:assert/strict";
import { afterAll, test } from "bun:test";
import { setTimeout as delay } from "node:timers/promises";
import { database } from "@bazak/evaluation-store/client";
import { createConversationRepository } from "@bazak/evaluation-store/conversations";
import { createRecoveryQueue } from "@bazak/evaluation-store/recovery";
import { createFixtureServices } from "../../web/src/server/services.test.ts";
import { recoverExpiredTurns } from "../src/recover.ts";

assert.ok(process.env.SHOPPER_TEST_DATABASE?.startsWith("bazak_test_"));

assert.equal(
  new URL(process.env.DATABASE_URL ?? "").pathname,
  "/" + process.env.SHOPPER_TEST_DATABASE,
);

const testThreads: string[] = [];

afterAll(async () => {
  try {
    await database.shoppingThread.deleteMany({ where: { id: { in: testThreads } } });
  } finally {
    await database.$disconnect();
  }
});

const repo = createConversationRepository();

const queue = createRecoveryQueue();

const services = createFixtureServices(repo);

const now = () => new Date().toISOString();

const past = new Date(Date.now() - 100_000).toISOString();

const future = () => new Date(Date.now() + 90_000).toISOString();

async function abandon(cutoff = past, repository = repo) {
  const threadId = crypto.randomUUID();
  const turnId = crypto.randomUUID();
  const start = new Date(Date.parse(cutoff) - 90_000).toISOString();
  await repository.create(threadId, start);
  testThreads.push(threadId);
  await repository.beginTurn(threadId, { turnId, text: "Two fragrances under $50" }, start, cutoff);

  return { threadId, turnId };
}

async function waitForAnswer(threadId: string, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- Observe the child process's committed result.
    const row = await database.shoppingTurn.findFirstOrThrow({ where: { threadId } });

    if (row.state === "completed") return;
    // oxlint-disable-next-line no-await-in-loop -- Bound polling while the worker starts up.
    await delay(150);
  }

  assert.fail("Worker did not commit the recovered turn.");
}

test("a fresh Bun worker picks up an abandoned shopper turn and saves one replayable answer", async () => {
  const { threadId, turnId } = await abandon();

  const child = Bun.spawn([process.execPath, "./apps/worker/src/main.mjs"], {
    env: { ...process.env, SHOPPER_BUILD_PROFILE: "fixture" },
    stdout: "ignore",
    stderr: "inherit",
  });

  try {
    await waitForAnswer(threadId);
    const history = await services.management.load(threadId);
    assert.equal(history.turns.length, 1);
    assert.equal(history.turns[0].turnId, turnId);
    assert.equal(history.turns[0].attempt, 2);
    assert.equal(history.turns[0].assistant?.parts[0]?.type, "products");
    const later = await abandon();
    await waitForAnswer(later.threadId, 65_000);
  } finally {
    child.kill("SIGTERM");
    await child.exited;
  }
}, 75_000);

test("a read can enqueue abandoned work; two consumers and a stale writer cannot overwrite the winner", async () => {
  const { threadId, turnId } = await abandon();
  assert.equal((await repo.load(threadId, now())).turns[0].state, "interrupted");
  const selected = await queue.pending();
  const sameBatch = { enqueueExpired: async () => {}, pending: async () => selected };
  await Promise.all([
    recoverExpiredTurns(sameBatch, services.chat),
    recoverExpiredTurns(sameBatch, services.chat),
  ]);
  const [turn] = (await repo.load(threadId, now())).turns;
  assert.equal(turn.state, "completed");
  assert.equal(turn.attempt, 2);
  assert.ok(turn.metrics);
  await assert.rejects(repo.fail(threadId, turnId, 1, now(), "failed", turn.metrics, null));
  assert.equal((await queue.pending()).length, 0);
});

test("healthy, deliberately interrupted, exhausted and evaluation attempts stay out of automatic retries", async () => {
  const active = await abandon(future());
  const stopped = await abandon(future());

  const metrics = {
    intentCalls: 0,
    plannerCalls: 0,
    catalogCalls: 0,
    queries: [],
    planner: [],
    firstVisibleMs: null,
    durationMs: 0,
  };

  await repo.fail(stopped.threadId, stopped.turnId, 1, now(), "interrupted", metrics, null);
  const exhausted = await abandon();
  await repo.beginRetry(
    exhausted.threadId,
    exhausted.turnId,
    1,
    past,
    new Date(Date.parse(past) + 1000).toISOString(),
  );
  await repo.beginRetry(
    exhausted.threadId,
    exhausted.turnId,
    2,
    new Date(Date.parse(past) + 2000).toISOString(),
    new Date(Date.parse(past) + 3000).toISOString(),
  );
  const otherRepo = createConversationRepository("evaluation/test");
  const evaluation = await abandon(past, otherRepo);
  await recoverExpiredTurns(queue, services.chat);
  assert.equal((await repo.load(active.threadId, now())).turns[0].state, "running");
  assert.equal((await repo.load(stopped.threadId, now())).turns[0].attempt, 1);
  const [last] = (await repo.load(exhausted.threadId, now())).turns;
  assert.deepEqual([last.state, last.attempt], ["interrupted", 3]);
  assert.equal(
    (await database.shoppingTurn.findFirstOrThrow({ where: { threadId: evaluation.threadId } }))
      .state,
    "running",
  );
  assert.equal((await queue.pending()).length, 0);
});
