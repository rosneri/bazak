import { catalogReadSignal } from "@bazak/product-discovery/application/catalog";
import { recordInput } from "#application/step-input";
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

const scopeGuidance = [
  "This action is not supported at the moment. You can ask me to:",
  "1. Find a product, like a desk lamp.",
  "2. Search within a budget, like fragrances under $50.",
  "3. Check the current price or stock of a product I’ve shown you.",
].join("\n");

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

  const input = { label: group.label, criteria: group.criteria, hint: plan?.hint };
  recordInput(response.metrics, "catalog", "Lookup arguments", input);

  return bounded(
    () =>
      response.deps.discovery.lookup(
        input,
        retrieval,
        (query) => {
          response.metrics.catalogCalls++;
          response.metrics.queries.push(query);
        },
        (url) => response.metrics.providerUrls?.push(url),
      ),
    retrieval,
  );
}

function recordProductGroup(response: TurnResponse, result: ResultGroup): ConversationEvent {
  const part = { type: "products", version: 1, group: result } as const;
  response.parts.push(part);

  return { type: "products", turnId: response.turnId, part };
}

async function* streamSearchGroups(
  response: TurnResponse,
  groups: SearchGroup[],
): AsyncGenerator<ConversationEvent, ConversationEvent> {
  const { deps, signal, id, metrics } = response;

  const plans = await planGroups(
    groups,
    id,
    deps.repository,
    deps.queryPlanner,
    metrics,
    stageSignal(signal, 8_000),
  );

  const retrieval = catalogReadSignal(signal);

  for (const [index, group] of groups.entries()) {
    signal.throwIfAborted();

    if (group.kind === "search" && !plans.get(index)?.question)
      yield { type: "lookup", turnId: response.turnId, label: group.label };

    // Deliver each group before requesting the next.
    // oxlint-disable-next-line no-await-in-loop
    const result = await resolveSearchGroup(group, plans.get(index), response, retrieval);
    const event = recordProductGroup(response, result);

    if (index === groups.length - 1) return event;
    response.markVisible();
    yield event;
  }

  throw new Error("A discovery decision requires a group.");
}

async function loadProductDetail(response: TurnResponse, productId: string): Promise<ResultGroup> {
  const {
    signal,
    metrics,
    deps: { discovery },
  } = response;

  const retrieval = catalogReadSignal(signal);
  metrics.catalogCalls++;
  recordInput(metrics, "catalog", "Detail arguments", { productId });

  const snapshot = await bounded(
    () => discovery.detail(productId, retrieval, (url) => metrics.providerUrls?.push(url)),
    retrieval,
  );

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

export async function* streamTurnResponse(
  response: TurnResponse,
  decision: IntentDecision,
): AsyncGenerator<ConversationEvent, ConversationEvent> {
  if (decision.kind === "clarify" || decision.kind === "off-catalog") {
    const text = decision.kind === "clarify" ? decision.question : scopeGuidance;
    response.parts.push({ type: "text", text });

    return { type: "text-delta", turnId: response.turnId, text };
  }

  if (decision.kind === "discover") return yield* streamSearchGroups(response, decision.searches);
  else if (decision.kind === "detail") {
    yield { type: "lookup", turnId: response.turnId, label: "Product details" };

    return recordProductGroup(response, await loadProductDetail(response, decision.productId));
  } else throw new Error("Unresolved reference.");
}
