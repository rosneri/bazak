import type { MetricName, Profile } from "@bazak/evaluations";

const baseMetrics: { key: MetricName; label: string }[] = [
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

export function metricsFor(profile: Profile) {
  return baseMetrics.map((metric) =>
    profile === "model" && metric.key === "intentMatch"
      ? { ...metric, label: "Exact model proposal" }
      : metric,
  );
}
