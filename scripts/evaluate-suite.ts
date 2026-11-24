import {
  attemptUsage,
  combineUsage,
  type UsageSummary,
} from "../packages/features/conversation/src/domain/usage.ts";
import { randomUUID } from "node:crypto";
import type { Turn } from "../packages/features/conversation/src/domain/turn.ts";
import type { ShopperServices } from "../apps/web/src/server/services.ts";
import { createConversationRepository } from "../packages/adapters/evaluation-store/src/conversations.ts";
import { saveResults } from "../packages/adapters/evaluation-store/src/results.ts";
import { database } from "../packages/adapters/evaluation-store/src/client.ts";
import {
  caseSchema,
  type EvaluationCase,
} from "../packages/features/evaluation/src/domain/cases.ts";
import {
  evaluationUsage,
  evaluationPassed,
  evaluationResultSchema,
  type Profile,
  type Observation,
  type EvaluationResult,
} from "../packages/features/evaluation/src/domain/result.ts";
import { observe, score } from "../packages/features/evaluation/src/application/evaluate.ts";

type Factory = (repository: ReturnType<typeof createConversationRepository>) => ShopperServices;

async function sendAndReloadTurn(
  services: ShopperServices,
  threadId: string,
  prompt: string,
  measured: UsageSummary[],
) {
  const index = measured.push(attemptUsage(null)) - 1;
  const turnId = randomUUID();
  const stream = await services.chat.send(threadId, { turnId, text: prompt });
  let diagnostic: string | null = null;

  for await (const event of stream) {
    if (event.type === "error") diagnostic = event.code;
  }

  const history = await services.management.load(threadId);
  const turn = history.turns.find((entry) => entry.turnId === turnId);

  if (!turn) throw new Error("The conversation did not retain the scored turn.");

  measured[index] = attemptUsage(turn.metrics);

  return { turn, diagnostic };
}

type CaseIdentity = Pick<EvaluationResult, "id" | "runId" | "caseName" | "profile" | "expected">;

async function prepareEvaluationThread(
  services: ShopperServices,
  threadId: string,
  expected: EvaluationCase,
  measured: UsageSummary[],
) {
  if (expected.priorChat) {
    const prior = randomUUID();
    await services.management.create(prior);

    if (
      (await sendAndReloadTurn(services, prior, expected.priorChat, measured)).turn.state !==
      "completed"
    )
      throw new Error("Background chat failed.");
  }

  await services.management.create(threadId);

  if (
    expected.priorTurn &&
    (await sendAndReloadTurn(services, threadId, expected.priorTurn, measured)).turn.state !==
      "completed"
  )
    throw new Error("Background turn failed.");
}

function measureTurnTiming(turn: Pick<Turn, "metrics">, startedAt: number) {
  return {
    recordedAt: new Date().toISOString(),
    firstOutputMs: turn.metrics?.firstVisibleMs ?? null,
    durationMs: turn.metrics?.durationMs ?? Date.now() - startedAt,
  };
}

function canScoreTurn(turn: Turn, actual: Observation) {
  return (
    turn.state === "completed" &&
    actual.metrics !== null &&
    actual.decision !== null &&
    !actual.groups.some((group) => group.kind === "lookup-error")
  );
}

function executionErrorResult(
  base: CaseIdentity,
  actual: Observation,
  timing: Pick<EvaluationResult, "recordedAt" | "firstOutputMs" | "durationMs">,
  detail: string,
) {
  return evaluationResultSchema.parse({
    ...base,
    ...timing,
    actual,
    outcome: "execution-error",
    intentMatch: null,
    constraintsSatisfied: null,
    correctAbstention: null,
    detail,
  });
}

function scoredResult(
  base: CaseIdentity,
  actual: Observation,
  timing: ReturnType<typeof measureTurnTiming>,
) {
  return evaluationResultSchema.parse({
    ...base,
    ...timing,
    actual,
    outcome: "observed",
    ...score(base.expected, actual),
  });
}

export async function executeCase(
  factory: Factory,
  runId: string,
  profile: Profile,
  example: EvaluationCase,
) {
  const expected = caseSchema.parse(example);
  const services = factory(createConversationRepository(`evaluation/${runId}/${expected.name}`));
  const threadId = randomUUID();
  let startedAt = Date.now();
  let detail = "Could not execute this case. Check local storage and the service configuration.";
  const measured: UsageSummary[] = [];
  const base = { id: randomUUID(), runId, caseName: expected.name, profile, expected };

  try {
    await prepareEvaluationThread(services, threadId, expected, measured);
    startedAt = Date.now();

    const { turn, diagnostic } = await sendAndReloadTurn(
      services,
      threadId,
      expected.prompt,
      measured,
    );

    const actual = { ...observe(turn), caseUsage: combineUsage(measured) };

    const timing = measureTurnTiming(turn, startedAt);

    if (canScoreTurn(turn, actual)) return scoredResult(base, actual, timing);

    detail = diagnostic ?? "The model or catalog operation did not complete.";

    return executionErrorResult(base, actual, timing, detail);
  } catch {
    return executionErrorResult(
      base,
      { decision: null, groups: [], metrics: null, caseUsage: combineUsage(measured) },
      measureTurnTiming({ metrics: null }, startedAt),
      detail,
    );
  }
}

export async function runSuite(factory: Factory, profile: Profile, examples: EvaluationCase[]) {
  const runId = randomUUID();
  const results: EvaluationResult[] = [];

  try {
    for (const example of examples) {
      // oxlint-disable-next-line no-await-in-loop -- Serial turns keep measured latencies independent of competing evaluation work.
      const result = await executeCase(factory, runId, profile, example);
      results.push(result);
      console.log(
        `${evaluationPassed(result) ? "Passed" : result.outcome === "observed" ? "Disagreed" : "Execution error"} | ${result.caseName} | first ${result.firstOutputMs ?? "—"} ms | total ${result.durationMs} ms`,
      );
    }

    await saveResults(results);
    console.log("Run usage: " + evaluationUsage(results));
    console.log(`Saved ${profile} run ${runId} at http://127.0.0.1:3002/?run=${runId}`);

    if (results.some((result) => !evaluationPassed(result))) process.exitCode = 1;
  } finally {
    await database.$disconnect();
  }
}
