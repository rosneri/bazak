import type { DiscoveryCriteria, IntentDecision } from "@bazak/product-discovery/domain/discovery";
import { cents } from "@bazak/product-discovery/application/discovery";
import type { Turn } from "@bazak/conversation/domain/turn";
import {
  authorizeDecision,
  groundedKeywords,
  maxGroups,
  searchLabel,
  type ModelDecision,
} from "#application/model-decision";

import { productGroupsOf } from "#application/context";

export function routingHistory(turns: Turn[]) {
  return turns.map((turn) => ({
    text: turn.text,
    groups: productGroupsOf(turn).map(({ kind, criteria, products }) => ({
      kind,
      criteria,
      products: products.map(({ id, price }) => ({ id, price })),
    })),
  }));
}

type RoutingHistory = ReturnType<typeof routingHistory>;

const clarify = (question: string): IntentDecision => ({ kind: "clarify", question });

function authorizePriorCriteria(criteria: DiscoveryCriteria, history: RoutingHistory) {
  const { keywords } = criteria;

  if (!keywords) return criteria;
  const grounded = history.map((turn) => groundedKeywords(keywords, turn.text)).find(Boolean);

  if (grounded) return { ...criteria, keywords: grounded };
}

function resolveRetryGroup(group: number, history: RoutingHistory): IntentDecision {
  const turn = history[Math.floor(group / maxGroups)];
  const previous = turn?.groups[group % maxGroups];

  const criteria =
    previous?.kind === "lookup-error" && previous.criteria
      ? authorizePriorCriteria(previous.criteria, history)
      : undefined;

  return criteria
    ? {
        kind: "discover",
        searches: [
          {
            kind: "search",
            label: searchLabel(criteria),
            criteria,
            readiness: "ready",
          },
        ],
      }
    : clarify("Which previous product lookup should I try again?");
}

function resolveCheaperSearch(
  decision: Extract<IntentDecision, { kind: "cheaper" }>,
  history: RoutingHistory,
): IntentDecision {
  const visible = [...history]
    .reverse()
    .map((turn) => turn.groups)
    .map((groups) => groups.filter((group) => group.products.length && group.criteria));

  const group = decision.productId
    ? visible
        .flat()
        .find((candidate) => candidate.products.some((p) => p.id === decision.productId))
    : visible.find((groups) => groups.length)?.at(0);

  const prior = group?.criteria && authorizePriorCriteria(group.criteria, history);

  if (
    !group ||
    !prior ||
    (!decision.productId && visible.find((groups) => groups.length)?.length !== 1)
  )
    return clarify("Which product or group would you like a cheaper alternative to?");

  const baseline = decision.productId
    ? group.products.find((p) => p.id === decision.productId)?.price
    : Math.min(...group.products.map((p) => p.price));

  if (baseline === undefined) return clarify("Which product price should I compare against?");

  const previousCeiling =
    prior.maxPrice === undefined
      ? Infinity
      : cents(prior.maxPrice) - (prior.priceBoundary === "exclusive" ? 1 : 0);

  const criteria: DiscoveryCriteria = {
    ...prior,
    maxPrice: Math.min(cents(baseline), previousCeiling + 1) / 100,
    priceBoundary: "exclusive",
    priceOrder: "ascending",
    count: 1,
  };

  return {
    kind: "discover",
    searches: [{ kind: "search", label: searchLabel(criteria), criteria, readiness: "ready" }],
  };
}

function replacePrice(
  proposal: Extract<ModelDecision, { kind: "replace-price" }>,
  history: RoutingHistory,
): IntentDecision {
  const groups = history
    .map((turn) => turn.groups)
    .reverse()
    .find((items) => items.length > 0);

  const previous = groups?.length === 1 && groups[0].criteria;
  const prior = previous && authorizePriorCriteria(previous, history);

  if (!prior) return clarify("Which product group should I apply that price limit to?");

  const criteria = { ...prior };
  delete criteria.minPrice;
  delete criteria.minPriceBoundary;
  delete criteria.maxPrice;
  delete criteria.priceBoundary;

  if (proposal.side === "minimum") {
    criteria.minPrice = proposal.amount;
    criteria.minPriceBoundary = proposal.boundary;
  } else {
    criteria.maxPrice = proposal.amount;
    criteria.priceBoundary = proposal.boundary;
  }

  return {
    kind: "discover",
    searches: [{ kind: "search", label: searchLabel(criteria), criteria, readiness: "ready" }],
  };
}

export function resolveReferences({
  proposal,
  text,
  history,
}: {
  proposal: ModelDecision;
  text: string;
  history: RoutingHistory;
}): IntentDecision {
  if (proposal.kind === "replace-price") return replacePrice(proposal, history);

  const decision = authorizeDecision(proposal, text);

  if (decision.kind === "detail") {
    return history.some((turn) =>
      turn.groups.some((group) => group.products.some((p) => p.id === decision.productId)),
    )
      ? decision
      : clarify("Which previously shown product would you like me to check?");
  }

  if (decision.kind === "retry-group") return resolveRetryGroup(decision.group, history);

  if (decision.kind === "cheaper") return resolveCheaperSearch(decision, history);

  return decision;
}
