import { approvedFraming } from "#application/framing";
import { bounded, stageSignal } from "#application/deadline";
import type { ConversationDependencies, ConversationEvent } from "#application/chat";
import type { IntentDecision } from "@bazak/product-discovery/domain/discovery";
import { planGroups, type SearchGroup, type GroupPlan } from "#application/query-planner";
import type { MessagePart, ResultGroup, AttemptMetrics } from "@bazak/conversation/domain/turn";

export interface TurnResponse {
  deps: ConversationDependencies;
  id: string;
  turnId: string;
  signal: AbortSignal;
  parts: MessagePart[];
  metrics: AttemptMetrics;
  markVisible(): void;
}

const scopeGuidance =
  "I can help you find products in the catalog. What would you like to shop for?";

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

async function resolveSearchGroup(
  group: SearchGroup,
  plan: GroupPlan | undefined,
  response: TurnResponse,
  retrieval: AbortSignal,
): Promise<ResultGroup> {
  if (group.kind !== "search") return guidance(group);

  if (plan?.question)
    return {
      ...guidance({ kind: "clarify", label: group.label, question: plan.question }),
      criteria: group.criteria,
    };

  return bounded(
    () =>
      response.deps.discovery.lookup(
        { label: group.label, criteria: group.criteria, hint: plan?.hint },
        retrieval,
        (query) => {
          response.metrics.catalogCalls++;
          response.metrics.queries.push(query);
        },
      ),
    retrieval,
  );
}

function recordProductGroup(response: TurnResponse, result: ResultGroup): ConversationEvent {
  const part = { type: "products", version: 1, group: result } as const;
  response.parts.push(part);
  response.markVisible();

  return { type: "products", turnId: response.turnId, part };
}

async function* streamSearchGroups(
  response: TurnResponse,
  groups: SearchGroup[],
): AsyncGenerator<ConversationEvent> {
  const { deps, signal, id, metrics } = response;

  const plans = await planGroups(
    groups,
    id,
    deps.repository,
    deps.queryPlanner,
    metrics,
    stageSignal(signal, 8_000),
  );

  const retrieval = stageSignal(signal, 25_000);

  for (const [index, group] of groups.entries()) {
    signal.throwIfAborted();
    // Deliver each group before requesting the next.
    // oxlint-disable-next-line no-await-in-loop
    const result = await resolveSearchGroup(group, plans.get(index), response, retrieval);
    yield recordProductGroup(response, result);
  }
}

async function loadProductDetail(response: TurnResponse, productId: string): Promise<ResultGroup> {
  const {
    signal,
    metrics,
    deps: { discovery },
  } = response;

  const retrieval = stageSignal(signal, 25_000);
  metrics.catalogCalls++;

  const snapshot = await bounded(() => discovery.detail(productId, retrieval), retrieval);

  return snapshot
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
}

async function* streamReplyFraming(response: TurnResponse): AsyncGenerator<ConversationEvent> {
  const {
    signal,
    metrics,
    turnId,
    parts,
    deps: { model },
  } = response;

  signal.throwIfAborted();
  const replySignal = stageSignal(signal, 25_000);
  metrics.replyCalls++;

  let framing = "";

  for await (const phrase of approvedFraming(model.reply(replySignal), replySignal)) {
    framing += phrase;
    response.markVisible();
    yield { type: "text-delta", turnId, text: phrase };
  }

  if (framing) parts.push({ type: "text", text: framing });
}

export async function* streamTurnResponse(
  response: TurnResponse,
  decision: IntentDecision,
): AsyncGenerator<ConversationEvent> {
  if (decision.kind === "clarify" || decision.kind === "off-catalog") {
    const text = decision.kind === "clarify" ? decision.question : scopeGuidance;
    response.parts.push({ type: "text", text });
    response.markVisible();
    yield { type: "text-delta", turnId: response.turnId, text };

    return;
  }

  if (decision.kind === "discover") yield* streamSearchGroups(response, decision.searches);
  else if (decision.kind === "detail")
    yield recordProductGroup(response, await loadProductDetail(response, decision.productId));
  else throw new Error("Unresolved reference.");
  yield* streamReplyFraming(response);
}
