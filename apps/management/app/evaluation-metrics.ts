import type { MetricName } from "@bazak/evaluations";

export const metrics: { key: MetricName; label: string }[] = [
  { key: "intentMatch", label: "Intent match" },
  { key: "constraintsSatisfied", label: "Product constraints" },
  { key: "correctAbstention", label: "Correct abstention" },
];

export function formatDuration(value: number | null) {
  return value === null ? "—" : value + " ms";
}

export function formatMetricOutcome(value: boolean | null) {
  return value === null ? "Unscored" : value ? "Pass" : "Fail";
}
