import { randomUUID } from "node:crypto";
import type { ShopperServices } from "../apps/web/src/server/services.ts";
import { createConversationRepository } from "../packages/adapters/evaluation-store/src/conversations.ts";
import { saveResults } from "../packages/adapters/evaluation-store/src/results.ts";
import { database } from "../packages/adapters/evaluation-store/src/client.ts";
import {
  caseSchema,
  type EvaluationCase,
} from "../packages/features/evaluation/src/domain/cases.ts";
import {
  evaluationPassed,
  evaluationResultSchema,
  type Profile,
  type EvaluationResult,
} from "../packages/features/evaluation/src/domain/result.ts";
import { observe, score } from "../packages/features/evaluation/src/application/evaluate.ts";

type Factory = (repository: ReturnType<typeof createConversationRepository>) => ShopperServices;

async function send(services: ShopperServices, threadId: string, prompt: string) {
  const turnId = randomUUID();
  const stream = await services.chat.send(threadId, { turnId, text: prompt });
  let diagnostic: string | null = null;

  for await (const event of stream) {
    if (event.type === "error") diagnostic = event.code + " — " + event.message;
  }

  const history = await services.management.load(threadId);
  const turn = history.turns.find((entry) => entry.turnId === turnId);

  if (!turn) throw new Error("The conversation did not retain the scored turn.");

  return { turn, diagnostic };
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
  const base = { id: randomUUID(), runId, caseName: expected.name, profile, expected };

  try {
    if (expected.priorChat) {
      const prior = randomUUID();
      await services.management.create(prior);

      if ((await send(services, prior, expected.priorChat)).turn.state !== "completed")
        throw new Error("Background chat failed.");
    }

    await services.management.create(threadId);

    if (
      expected.priorTurn &&
      (await send(services, threadId, expected.priorTurn)).turn.state !== "completed"
    )
      throw new Error("Background turn failed.");
    startedAt = Date.now();
    const { turn, diagnostic } = await send(services, threadId, expected.prompt);
    const actual = observe(turn);

    const timing = {
      recordedAt: new Date().toISOString(),
      firstOutputMs: turn.metrics?.firstVisibleMs ?? null,
      durationMs: turn.metrics?.durationMs ?? Date.now() - startedAt,
    };

    if (
      turn.state === "completed" &&
      actual.metrics &&
      actual.decision &&
      !actual.groups.some((group) => group.kind === "lookup-error")
    ) {
      return evaluationResultSchema.parse({
        ...base,
        ...timing,
        actual,
        outcome: "observed",
        ...score(expected, actual),
      });
    }

    detail = diagnostic ?? "The model or catalog operation did not complete.";

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
  } catch {
    return evaluationResultSchema.parse({
      ...base,
      recordedAt: new Date().toISOString(),
      firstOutputMs: null,
      durationMs: Date.now() - startedAt,
      actual: { decision: null, groups: [], metrics: null },
      outcome: "execution-error",
      intentMatch: null,
      constraintsSatisfied: null,
      correctAbstention: null,
      detail,
    });
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
    console.log(`Saved ${profile} run ${runId} at http://127.0.0.1:3002/?run=${runId}`);

    if (results.some((result) => !evaluationPassed(result))) process.exitCode = 1;
  } finally {
    await database.$disconnect();
  }
}
