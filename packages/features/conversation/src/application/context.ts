import type { DiscoveryCriteria, IntentDecision } from "@bazak/product-discovery/domain/discovery";
import { cents } from "@bazak/product-discovery/application/discovery";
import type { Turn } from "@bazak/conversation/domain/turn";

export interface ContextTurn {
  text: string;
  reply: string;
  groups: {
    label: string;
    criteria: DiscoveryCriteria | null;
    products: { id: string; title: string; price: number }[];
  }[];
}

function groupsOf(turn: Turn) {
  return (
    turn.assistant?.parts.flatMap((part) => (part.type === "products" ? [part.group] : [])) ?? []
  );
}

export function recentContext(turns: Turn[]): ContextTurn[] {
  return turns.slice(-8).map((turn) => ({
    text: turn.text.slice(0, 500),
    reply:
      turn.assistant?.parts
        .map((part) => (part.type === "text" ? part.text : part.group.message))
        .join(" ")
        .slice(0, 500) ?? "",
    groups: groupsOf(turn).map((group) => ({
      label: group.label,
      criteria: group.criteria,
      products: group.products.map(({ id, title, price }) => ({
        id,
        title: title.slice(0, 100),
        price,
      })),
    })),
  }));
}

const clarify = (question: string): IntentDecision => ({ kind: "clarify", question });

export function resolveReferences(decision: IntentDecision, history: Turn[]): IntentDecision {
  if (decision.kind === "detail") {
    return history.some((turn) =>
      groupsOf(turn).some((group) => group.products.some((p) => p.id === decision.productId)),
    )
      ? decision
      : clarify("Which previously shown product would you like me to check?");
  }

  if (decision.kind !== "cheaper" && decision.kind !== "retry-group") return decision;
  const recent = [...history].reverse();

  if (decision.kind === "retry-group") {
    const previous = recent
      .flatMap(groupsOf)
      .find(
        (group) =>
          group.kind === "lookup-error" &&
          group.label.toLowerCase() === decision.label.toLowerCase(),
      );

    return previous?.criteria
      ? {
          kind: "discover",
          searches: [
            {
              kind: "search",
              label: previous.label,
              criteria: previous.criteria,
              readiness: "ready",
            },
          ],
        }
      : clarify("Which previous product lookup should I try again?");
  }

  const visible = recent
    .map(groupsOf)
    .map((groups) => groups.filter((group) => group.products.length && group.criteria));

  const group = decision.productId
    ? visible
        .flat()
        .find((candidate) => candidate.products.some((p) => p.id === decision.productId))
    : visible.find((groups) => groups.length)?.at(0);

  if (
    !group?.criteria ||
    (!decision.productId && visible.find((groups) => groups.length)?.length !== 1)
  )
    return clarify("Which product or group would you like a cheaper alternative to?");

  const baseline = decision.productId
    ? group.products.find((p) => p.id === decision.productId)?.price
    : Math.min(...group.products.map((p) => p.price));

  if (baseline === undefined) return clarify("Which product price should I compare against?");
  const prior = group.criteria;

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
    searches: [{ kind: "search", label: group.label, criteria, readiness: "ready" }],
  };
}
