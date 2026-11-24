import type { UsageObserver } from "@bazak/conversation/domain/usage";
import { recordInput, type PromptObserver } from "#application/step-input";
import { routingHistory } from "#application/resolve-references";
import { streamTurnResponse, type TurnResponse } from "#application/turn-response";
import { resolveReferences } from "#application/resolve-references";
import { recentContext, type ContextTurn } from "#application/context";
import {
  maxContextTurns,
  modelDecisionSchema,
  type ModelDecision,
} from "#application/model-decision";

import { bounded, stageSignal } from "#application/deadline";
import {
  intentDecisionSchema,
  type IntentDecision,
} from "@bazak/product-discovery/domain/discovery";
import type { DiscoveryService } from "@bazak/product-discovery/application/discovery";
import {
  assistantMessageSchema,
  conversationHistorySchema,
  idSchema,
  retryTurnInputSchema,
  sendTurnInputSchema,
  type SendTurnInput,
  type Turn,
  type TurnEvent,
} from "@bazak/conversation/domain/turn";
import type { QueryPlanner } from "#application/query-planner";
import {
  RepositoryError,
  type Acquisition,
  type Clock,
  type ConversationRepository,
  type RepositoryCode,
} from "@bazak/conversation/application/repository";

export type { ContextTurn } from "#application/context";

export { modelDecisionSchema, type ModelDecision } from "#application/model-decision";

export { sendTurnInputSchema } from "@bazak/conversation/domain/turn";

export { SAFE_FRAMING } from "#application/framing";

export type TurnErrorCode = RepositoryCode | "provider_configuration" | "attempt_failed";

export type ConversationEvent =
  | Exclude<TurnEvent, { type: "error" }>
  | { type: "error"; turnId: string; code: TurnErrorCode };

export interface ModelInput {
  text: string;
  history: ContextTurn[];
}

export interface ConversationModel {
  decide(
    input: ModelInput,
    signal: AbortSignal,
    observe?: PromptObserver,
    usage?: UsageObserver,
  ): Promise<ModelDecision>;
  reply(
    signal: AbortSignal,
    observe?: PromptObserver,
    usage?: UsageObserver,
  ): AsyncIterable<string>;
}

export interface ConversationDependencies {
  repository: ConversationRepository;
  model: ConversationModel;
  queryPlanner: QueryPlanner;
  discovery: DiscoveryService;
  clock: Clock;
}

const leaseMs = 90_000;

function failureCode(cause: unknown): TurnErrorCode {
  if (cause instanceof RepositoryError) return cause.code;

  if (cause instanceof Error && cause.name === "ProviderConfigurationError")
    return "provider_configuration";

  return "attempt_failed";
}

interface TurnAttempt extends TurnResponse {
  turn: Turn;
  attemptNumber: number;
  decision: IntentDecision | null;
  elapsed(): number;
}

function startAttempt(
  deps: ConversationDependencies,
  id: string,
  turn: Turn,
  started: number,
  caller?: AbortSignal,
): TurnAttempt {
  const { clock } = deps;
  const remaining = started + leaseMs - clock().getTime();
  const timeout = remaining > 0 ? AbortSignal.timeout(remaining) : AbortSignal.abort();
  const signal = caller ? AbortSignal.any([caller, timeout]) : timeout;

  const metrics: TurnResponse["metrics"] = {
    intentCalls: 0,
    plannerCalls: 0,
    catalogCalls: 0,
    replyCalls: 0,
    planner: [],
    queries: [],
    providerUrls: [],
    stepInputs: [],
    usage: [],
    firstVisibleMs: null,
    durationMs: 0,
  };

  const elapsed = () => Math.max(0, clock().getTime() - started);

  const markVisible = () => {
    metrics.firstVisibleMs ??= elapsed();
  };

  return {
    deps,
    id,
    turn,
    turnId: turn.turnId,
    attemptNumber: turn.attempt,
    signal,
    metrics,
    elapsed,
    markVisible,
    parts: [],
    decision: null,
  };
}

async function interpretTurn(attempt: TurnAttempt) {
  const {
    deps: { repository, clock, model },
    id,
    signal,
    turnId,
    turn,
    metrics,
  } = attempt;

  const saved = await bounded(() => repository.load(id, clock().toISOString()), signal);
  const parsed = conversationHistorySchema.safeParse(saved);

  if (!parsed.success) throw new RepositoryError("corrupt_thread");
  const history: Turn[] = [];

  for (const prior of parsed.data.turns) {
    if (prior.turnId === turnId) break;

    if (prior.state === "completed") history.push(prior);
  }

  const intentSignal = stageSignal(signal, 20_000);
  metrics.intentCalls++;

  const recent = history.slice(-maxContextTurns);

  const input = { text: turn.text, history: recentContext(recent) };
  recordInput(metrics, "intent", "Model input", input);

  const interpreted = modelDecisionSchema.parse(
    await bounded(
      () =>
        model.decide(
          input,
          intentSignal,
          (prompt) => recordInput(metrics, "intent", "Provider prompt", prompt),
          (usage) => metrics.usage?.push({ stage: "intent", ...usage }),
        ),
      intentSignal,
    ),
  );

  metrics.modelProposal = JSON.stringify(interpreted, null, 2);

  const decisionInput = { proposal: interpreted, text: turn.text, history: routingHistory(recent) };
  recordInput(metrics, "decision", "Routing arguments", decisionInput);

  return intentDecisionSchema.parse(resolveReferences(decisionInput));
}

async function failAttempt(attempt: TurnAttempt, state: "interrupted" | "failed") {
  const {
    deps: { clock, repository },
    turnId,
    attemptNumber,
    id,
    metrics,
    decision,
  } = attempt;

  metrics.durationMs = attempt.elapsed();
  await repository.fail(id, turnId, attemptNumber, clock().toISOString(), state, metrics, decision);
}

async function recordAttemptError(
  attempt: TurnAttempt,
  code: TurnErrorCode,
): Promise<TurnErrorCode> {
  try {
    await failAttempt(attempt, attempt.signal.aborted ? "interrupted" : "failed");

    return code;
  } catch (storageError) {
    return storageError instanceof RepositoryError ? storageError.code : "storage_unavailable";
  }
}

async function completeAttempt(attempt: TurnAttempt, decision: IntentDecision) {
  const {
    deps: { repository, clock },
    metrics,
    id,
    turnId,
    attemptNumber,
    signal,
    parts,
  } = attempt;

  signal.throwIfAborted();
  const assistant = assistantMessageSchema.parse({ parts });
  metrics.durationMs = attempt.elapsed();
  await repository.finish(
    id,
    turnId,
    attemptNumber,
    clock().toISOString(),
    assistant,
    metrics,
    decision,
  );

  return assistant;
}

async function* streamTurnEvents(
  deps: ConversationDependencies,
  id: string,
  acquisition: Acquisition,
  started: number,
  caller?: AbortSignal,
): AsyncGenerator<ConversationEvent> {
  const { turn, accepted } = acquisition;
  const { turnId, attempt } = turn;

  if (!accepted) {
    yield { type: "status", turnId, attempt, state: turn.state };

    if (turn.assistant && turn.state === "completed")
      yield { type: "done", turnId, assistant: turn.assistant };

    return;
  }

  const run = startAttempt(deps, id, turn, started, caller);
  let settled = false;

  try {
    yield { type: "status", turnId, attempt, state: "running" };
    run.decision = await interpretTurn(run);
    yield* streamTurnResponse(run, run.decision);
    const assistant = await completeAttempt(run, run.decision);
    settled = true;
    yield { type: "done", turnId, assistant };
  } catch (error) {
    const code = await recordAttemptError(run, failureCode(error));
    settled = true;
    yield { type: "error", turnId, code };
  } finally {
    if (!settled) await failAttempt(run, "interrupted");
  }
}

export function createConversationService(deps: ConversationDependencies) {
  const { clock, repository } = deps;

  return {
    async send(id: string, input: SendTurnInput, signal?: AbortSignal) {
      const start = clock();

      const acquisition = await repository.beginTurn(
        idSchema.parse(id),
        sendTurnInputSchema.parse(input),
        start.toISOString(),
        new Date(start.getTime() + leaseMs).toISOString(),
      );

      return streamTurnEvents(deps, id, acquisition, start.getTime(), signal);
    },
    async retry(id: string, turnId: string, expectedAttempt: number, signal?: AbortSignal) {
      const start = clock();
      const generation = retryTurnInputSchema.parse({ expectedAttempt }).expectedAttempt;

      const acquisition = await repository.beginRetry(
        idSchema.parse(id),
        idSchema.parse(turnId),
        generation,
        start.toISOString(),
        new Date(start.getTime() + leaseMs).toISOString(),
      );

      return streamTurnEvents(deps, id, acquisition, start.getTime(), signal);
    },
  };
}
