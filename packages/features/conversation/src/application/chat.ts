import { approvedFraming } from "#application/framing";
import { recentContext, resolveReferences, type ContextTurn } from "#application/context";

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
  type AssistantMessage,
  type AttemptMetrics,
  type MessagePart,
  type ResultGroup,
  type SendTurnInput,
  type Turn,
  type TurnEvent,
} from "@bazak/conversation/domain/turn";
import {
  planGroups,
  type QueryPlanner,
  type SearchGroup,
} from "@bazak/conversation/application/query-planner";
import {
  RepositoryError,
  type Acquisition,
  type Clock,
  type ConversationRepository,
} from "@bazak/conversation/application/repository";

export type { ContextTurn } from "#application/context";

export { sendTurnInputSchema } from "@bazak/conversation/domain/turn";

export { SAFE_FRAMING } from "#application/framing";

export interface ModelInput {
  text: string;
  history: ContextTurn[];
}

export interface ConversationModel {
  decide(input: ModelInput, signal: AbortSignal): Promise<IntentDecision>;
  reply(signal: AbortSignal): AsyncIterable<string>;
}

interface Dependencies {
  repository: ConversationRepository;
  model: ConversationModel;
  queryPlanner: QueryPlanner;
  discovery: DiscoveryService;
  clock: Clock;
}

const scopeGuidance =
  "I can help you find products in the catalog. What would you like to shop for?";

const leaseMs = 90_000;

function guidance(group: Exclude<SearchGroup, { kind: "search" }>): ResultGroup {
  return {
    kind: group.kind,
    label: group.label,
    criteria: null,
    products: [],
    coverage: null,
    message: group.kind === "clarify" ? group.question : scopeGuidance,
  };
}

function failureMessage(cause: unknown) {
  if (cause instanceof RepositoryError)
    return {
      code: cause.code,
      message: "This reply could not be saved. Reload the conversation to check its status.",
    };

  if (cause instanceof Error && cause.name === "ProviderConfigurationError")
    return {
      code: "provider_configuration",
      message: "Set OPENAI_API_KEY in the server environment, then retry this turn.",
    };

  return {
    code: "attempt_failed",
    message: "The reply was interrupted. Check the conversation and retry this turn.",
  };
}

export function createConversationService(deps: Dependencies) {
  const { clock, repository, model, queryPlanner, discovery } = deps;

  async function* events(
    id: string,
    acquisition: Acquisition,
    started: number,
    caller?: AbortSignal,
  ): AsyncGenerator<TurnEvent> {
    const { turn, accepted } = acquisition;
    const { turnId, attempt } = turn;

    if (!accepted) {
      yield { type: "status", turnId, attempt, state: turn.state };

      if (turn.assistant && turn.state === "completed")
        yield { type: "done", turnId, assistant: turn.assistant };

      return;
    }

    const remaining = started + leaseMs - clock().getTime();
    const timeout = remaining > 0 ? AbortSignal.timeout(remaining) : AbortSignal.abort();
    const signal = caller ? AbortSignal.any([caller, timeout]) : timeout;

    const metrics: AttemptMetrics = {
      intentCalls: 0,
      plannerCalls: 0,
      catalogCalls: 0,
      replyCalls: 0,
      planner: [],
      queries: [],
      firstVisibleMs: null,
      durationMs: 0,
    };

    const elapsed = () => Math.max(0, clock().getTime() - started);

    const visible = () => {
      metrics.firstVisibleMs ??= elapsed();
    };

    const parts: MessagePart[] = [];
    let decision: IntentDecision | null = null;
    let settled = false;

    const fail = async (state: "failed" | "interrupted") => {
      metrics.durationMs = elapsed();
      await repository.fail(id, turnId, attempt, clock().toISOString(), state, metrics, decision);
    };

    try {
      yield { type: "status", turnId, attempt, state: "running" };
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

      const interpreted = intentDecisionSchema.parse(
        await bounded(
          () => model.decide({ text: turn.text, history: recentContext(history) }, intentSignal),
          intentSignal,
        ),
      );

      decision = resolveReferences(interpreted, history);

      if (decision.kind === "clarify" || decision.kind === "off-catalog") {
        const text = decision.kind === "clarify" ? decision.question : scopeGuidance;
        parts.push({ type: "text", text });
        visible();
        yield { type: "text-delta", turnId, text };
      } else {
        if (decision.kind === "discover") {
          const groups = decision.searches;
          const planning = stageSignal(signal, 8_000);
          const plans = await planGroups(groups, id, repository, queryPlanner, metrics, planning);
          const retrieval = stageSignal(signal, 25_000);

          for (const [index, group] of groups.entries()) {
            signal.throwIfAborted();
            const plan = plans.get(index);
            let result: ResultGroup;

            if (group.kind !== "search") result = guidance(group);
            else if (plan?.question)
              result = {
                ...guidance({ kind: "clarify", label: group.label, question: plan.question }),
                criteria: group.criteria,
              };
            else
              // Each group is delivered before requesting the next group.
              // oxlint-disable-next-line no-await-in-loop
              result = await bounded(
                () =>
                  discovery.lookup(
                    { label: group.label, criteria: group.criteria, hint: plan?.hint },
                    retrieval,
                    (query) => {
                      metrics.catalogCalls++;
                      metrics.queries.push(query);
                    },
                  ),
                retrieval,
              );
            const part = { type: "products", version: 1, group: result } as const;
            parts.push(part);
            visible();
            yield { type: "products", turnId, part };
          }
        } else if (decision.kind === "detail") {
          const retrieval = stageSignal(signal, 25_000);
          metrics.catalogCalls++;

          const productId = decision.productId;
          const snapshot = await bounded(() => discovery.detail(productId, retrieval), retrieval);

          const result: ResultGroup = snapshot
            ? {
                kind: "matched",
                label: snapshot.title,
                criteria: null,
                products: [snapshot],
                coverage: "exhaustive",
                message: `The catalog currently lists this item at $${snapshot.price.toFixed(2)} with ${snapshot.stock} in stock.`,
              }
            : {
                kind: "empty",
                label: "Product details",
                criteria: null,
                products: [],
                coverage: "exhaustive",
                message: "The catalog no longer lists this product.",
              };

          const part = { type: "products", version: 1, group: result } as const;
          parts.push(part);
          visible();
          yield { type: "products", turnId, part };
        } else throw new Error("Unresolved reference.");
        signal.throwIfAborted();
        const replySignal = stageSignal(signal, 25_000);
        metrics.replyCalls++;

        for await (const phrase of approvedFraming(model.reply(replySignal), replySignal)) {
          parts.push({ type: "text", text: phrase });
          visible();
          yield { type: "text-delta", turnId, text: phrase };
        }
      }

      signal.throwIfAborted();
      const assistant: AssistantMessage = assistantMessageSchema.parse({ parts });
      metrics.durationMs = elapsed();
      await repository.finish(
        id,
        turnId,
        attempt,
        clock().toISOString(),
        assistant,
        metrics,
        decision,
      );
      settled = true;
      yield { type: "done", turnId, assistant };
    } catch (error) {
      let failure = failureMessage(error);

      try {
        await fail(signal.aborted ? "interrupted" : "failed");
      } catch (storageError) {
        failure = failureMessage(
          storageError instanceof RepositoryError
            ? storageError
            : new RepositoryError("storage_unavailable"),
        );
      }

      settled = true;
      yield { type: "error", turnId, ...failure };
    } finally {
      if (!settled) await fail("interrupted");
    }
  }

  return {
    async send(id: string, input: SendTurnInput, signal?: AbortSignal) {
      const start = clock();

      const acquisition = await repository.beginTurn(
        idSchema.parse(id),
        sendTurnInputSchema.parse(input),
        start.toISOString(),
        new Date(start.getTime() + leaseMs).toISOString(),
      );

      return events(id, acquisition, start.getTime(), signal);
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

      return events(id, acquisition, start.getTime(), signal);
    },
  };
}
