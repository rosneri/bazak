import type { ResultGroup, Turn } from "@bazak/conversation/domain/turn";
import type { EvaluationCase } from "@bazak/evaluations/cases";
import type { Observation } from "@bazak/evaluations";

function groupMatches(expected: EvaluationCase["groups"][number], group: ResultGroup) {
  if (group.criteria?.category !== expected.category || group.products.length !== expected.count)
    return false;

  if (expected.count === 0) return group.kind === "empty" && group.coverage === "exhaustive";

  if (group.kind !== "matched") return false;

  if (expected.firstId && group.products[0]?.id !== expected.firstId) return false;
  const ids = new Set<string>();

  for (const [index, product] of group.products.entries()) {
    if (ids.has(product.id) || product.stock <= 0 || product.category !== expected.category)
      return false;
    ids.add(product.id);

    if (expected.ids && !expected.ids.includes(product.id)) return false;

    if (
      expected.relevanceTerms &&
      !expected.relevanceTerms.some((term) =>
        (product.title + " " + product.description).toLowerCase().includes(term.toLowerCase()),
      )
    )
      return false;

    if (
      expected.under !== undefined &&
      Math.round(product.price * 100) >= Math.round(expected.under * 100)
    )
      return false;
    const previous = group.products[index - 1];

    if (previous && expected.order === "ascending" && product.price < previous.price) return false;

    if (previous && expected.order === "descending" && product.price > previous.price) return false;
  }

  return true;
}

export function observe(turn: Turn): Observation {
  const groups: ResultGroup[] = [];

  for (const part of turn.assistant?.parts ?? [])
    if (part.type === "products") groups.push(part.group);

  return { decision: turn.decision, groups, metrics: turn.metrics };
}

export function score(expected: EvaluationCase, actual: Observation) {
  const intentMatch = actual.decision?.kind === expected.intent;
  const abstain = expected.intent === "clarify" || expected.intent === "off-catalog";
  const plannerMatches = actual.metrics?.plannerCalls === expected.plannerCalls;

  const queryMatches =
    !expected.queryTerm ||
    actual.metrics?.queries.some(
      (query) =>
        query.source.kind === "search" &&
        query.source.keywords.toLowerCase() === expected.queryTerm?.toLowerCase(),
    );

  const constraintsSatisfied = abstain
    ? null
    : Boolean(
        plannerMatches &&
        queryMatches &&
        actual.groups.length === expected.groups.length &&
        expected.groups.every((group, index) => groupMatches(group, actual.groups[index])),
      );

  const correctAbstention = abstain
    ? intentMatch &&
      plannerMatches &&
      actual.metrics?.catalogCalls === 0 &&
      actual.groups.every((group) => group.products.length === 0)
    : null;

  return { intentMatch, constraintsSatisfied, correctAbstention };
}
