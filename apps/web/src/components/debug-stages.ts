import { summarizeCalls, formatUsage, type CallUsage } from "@bazak/conversation/domain/usage";
import type { Turn } from "@bazak/conversation/domain/turn";

function intentEvidence(turn: Turn) {
  if (!turn.metrics?.intentCalls) return "No intent call recorded.";

  return turn.metrics.modelProposal ?? "The original proposal was not recorded for this attempt.";
}

function catalogEvidence(turn: Turn) {
  const metrics = turn.metrics;

  if (!metrics) return "No catalog measurements available.";

  const outcomes =
    turn.assistant?.parts.flatMap((part) =>
      part.type === "products"
        ? [
            `${part.group.label} · ${part.group.kind} · ${part.group.products.length} displayed${part.group.coverage ? " · " + part.group.coverage : ""}`,
          ]
        : [],
    ) ?? [];

  return [`${metrics.catalogCalls} catalog requests started`, ...outcomes].join("\n");
}

function catalogRequests(turn: Turn) {
  const metrics = turn.metrics;

  if (!metrics) return [];

  const queries = metrics.queries.map(({ source, offset, limit }) => {
    const term = source.kind === "search" ? source.keywords : source.category;

    return `${source.kind} “${term}” · offset ${offset}, limit ${limit}`;
  });

  const requests =
    metrics.providerUrls?.map((url) => "GET " + url) ??
    (metrics.catalogCalls ? ["Provider URL was not recorded for this attempt."] : []);

  return [...queries, ...requests];
}

type Stage = NonNullable<NonNullable<Turn["metrics"]>["stepInputs"]>[number]["stage"];

function stageInput(turn: Turn, stage: Stage) {
  const records = turn.metrics?.stepInputs;

  const occurrences = new Map<string, number>();

  const inputs = (records ?? [])
    .filter((entry) => entry.stage === stage)
    .map(({ name, value }) => {
      const occurrence = (occurrences.get(name) ?? 0) + 1;
      occurrences.set(name, occurrence);

      return { name: occurrence === 1 ? name : `${name} (${occurrence})`, value };
    });

  if (stage === "catalog") {
    catalogRequests(turn).forEach((value, index) =>
      inputs.push({ name: `Query detail ${index + 1}`, value }),
    );
  }

  if (!records && stage === "decision" && turn.metrics?.modelProposal)
    inputs.push({
      name: "Saved proposal (routing context unavailable)",
      value: turn.metrics.modelProposal,
    });

  return inputs.length
    ? inputs
    : [
        {
          name: "Input availability",
          value: records ? "Step was not invoked." : "Input was not recorded for this attempt.",
        },
      ];
}

function catalogStatus(turn: Turn) {
  const groups =
    turn.assistant?.parts.flatMap((part) => (part.type === "products" ? [part.group] : [])) ?? [];

  if (groups.some((group) => group.kind === "lookup-error")) return "Lookup failed";

  if (groups.some((group) => group.coverage === "partial")) return "Partial coverage";

  if (groups.some((group) => group.kind === "matched")) return "Matches found";

  if (groups.some((group) => group.kind === "empty")) return "No matches";

  if (!turn.metrics) return "Unrecorded";

  return turn.metrics.catalogCalls ? "Attempted" : "Skipped";
}

type DebugStage = [
  label: string,
  status: string,
  inputs: ReturnType<typeof stageInput>,
  output: string,
];

function modelUsage(turn: Turn, stage: CallUsage["stage"], expected: number) {
  if (!expected) return "";
  const calls = turn.metrics?.usage?.filter((call) => call.stage === stage);

  const details =
    calls?.map(
      (call) =>
        `${call.model} · input ${call.input ?? "—"} · output ${call.output ?? "—"} · cache read ${call.cached ?? "—"} · cache write ${call.written ?? "—"} · reasoning ${call.reasoning ?? "—"}`,
    ) ?? [];

  return "\n" + [formatUsage(summarizeCalls(calls, expected)), ...details].join("\n");
}

export function debugStages(turn: Turn): DebugStage[] {
  const { metrics, decision } = turn;

  return [
    [
      "Intent model",
      metrics?.modelProposal ? "Proposal recorded" : "Unrecorded",
      stageInput(turn, "intent"),
      intentEvidence(turn) + modelUsage(turn, "intent", metrics?.intentCalls ?? 0),
    ],
    [
      "Application decision",
      decision?.kind ?? "Unrecorded",
      stageInput(turn, "decision"),
      decision ? JSON.stringify(decision, null, 2) : "No validated decision recorded.",
    ],
    [
      "Query planner",
      metrics?.planner.includes("fallback")
        ? "Fallback"
        : metrics
          ? metrics.plannerCalls
            ? "Called"
            : "Skipped"
          : "Unrecorded",
      stageInput(turn, "planner"),
      metrics
        ? [
            `${metrics.plannerCalls} model calls started`,
            ...metrics.planner.map((outcome, index) => `Group ${index + 1} · ${outcome}`),
          ].join("\n") + modelUsage(turn, "planner", metrics.plannerCalls)
        : "No planner measurements available.",
    ],
    ["Catalog lookup", catalogStatus(turn), stageInput(turn, "catalog"), catalogEvidence(turn)],
    [
      "Reply",
      turn.state,
      stageInput(turn, "reply"),
      metrics
        ? `${metrics.replyCalls} framing calls started · ${turn.state}\nFirst content: ${metrics.firstVisibleMs === null ? "none recorded" : metrics.firstVisibleMs + " ms"} · Total: ${metrics.durationMs} ms` +
          modelUsage(turn, "reply", metrics.replyCalls)
        : `Attempt ${turn.state}. No timing recorded.`,
    ],
  ];
}
