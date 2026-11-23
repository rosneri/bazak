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

export interface ContextTurn {
  text: string;
  groups: {
    label: string;
    criteria: Omit<DiscoveryCriteria, "keywords"> | null;
    retryGroup: number | null;
    products: { id: string; title: string; price: number }[];
  }[];
}

function groupsOf(turn: Turn) {
  return (
    turn.assistant?.parts
      .flatMap((part) => (part.type === "products" ? [part.group] : []))
      .slice(0, maxGroups) ?? []
  );
}

export function recentContext(turns: Turn[]): ContextTurn[] {
  return turns.map((turn, turnIndex) => ({
    text: turn.text.slice(0, 500),
    groups: groupsOf(turn).map((group, index) => {
      const { keywords, ...criteria } = group.criteria ?? {};
      const grounded = keywords && groundedKeywords(keywords, turn.text);

      return {
        label: searchLabel(grounded ? { ...criteria, keywords: grounded } : criteria),
        criteria: group.criteria ? criteria : null,
        retryGroup:
          group.kind === "lookup-error" && group.criteria ? turnIndex * maxGroups + index : null,
        products: group.products
          .filter(({ id }) => id.length <= 80)
          .map(({ id, title, price }) => ({ id, title: title.slice(0, 100), price })),
      };
    }),
  }));
}

const clarify = (question: string): IntentDecision => ({ kind: "clarify", question });

function authorizePriorCriteria(criteria: DiscoveryCriteria, history: Turn[]) {
  const { keywords } = criteria;

  if (!keywords) return criteria;
  const grounded = history.map((turn) => groundedKeywords(keywords, turn.text)).find(Boolean);

  if (grounded) return { ...criteria, keywords: grounded };
}

export function resolveReferences(
  proposal: ModelDecision,
  text: string,
  history: Turn[],
): IntentDecision {
  const decision = authorizeDecision(proposal, text);

  if (decision.kind === "detail") {
    return history.some((turn) =>
      groupsOf(turn).some((group) => group.products.some((p) => p.id === decision.productId)),
    )
      ? decision
      : clarify("Which previously shown product would you like me to check?");
  }

  if (decision.kind === "retry-group") {
    const turn = history[Math.floor(decision.group / maxGroups)];
    const previous = turn && groupsOf(turn)[decision.group % maxGroups];

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

  if (decision.kind !== "cheaper") return decision;

  const visible = [...history]
    .reverse()
    .map(groupsOf)
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
