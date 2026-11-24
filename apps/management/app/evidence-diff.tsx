import { caseSchema } from "@bazak/evaluations/cases";
import { diffJson } from "diff";
import type { EvaluationResult } from "@bazak/evaluations";
import "./evidence-diff.css";

type LinePair = { expected?: string; observed?: string; changed: boolean };

function splitLines(text: string) {
  return text.replace(/\n$/, "").split("\n");
}

function pairLines(expected: string[], observed: string[], changed: boolean): LinePair[] {
  return Array.from({ length: Math.max(expected.length, observed.length) }, (_, index) => ({
    expected: expected[index],
    observed: observed[index],
    changed,
  }));
}

type ComparablePair = ReturnType<typeof comparableEvidence>;

type EvidenceDocument =
  | ComparablePair[keyof ComparablePair]
  | EvaluationResult["actual"]
  | EvaluationResult["expected"];

function compareLines(expected: EvidenceDocument, observed: EvidenceDocument) {
  const changes = diffJson(expected, observed, { timeout: 100 });

  if (!changes)
    return pairLines(
      splitLines(JSON.stringify(expected, null, 2)),
      splitLines(JSON.stringify(observed, null, 2)),
      true,
    );
  const rows: LinePair[] = [];
  let removed: string[] = [];
  let added: string[] = [];

  for (const change of changes) {
    const lines = splitLines(change.value);

    if (change.removed) removed.push(...lines);
    else if (change.added) added.push(...lines);
    else {
      rows.push(...pairLines(removed, added, true), ...pairLines(lines, lines, false));
      removed = [];
      added = [];
    }
  }

  return rows.concat(pairLines(removed, added, true));
}

function readProposal(recorded?: string | null) {
  if (!recorded) return undefined;

  try {
    const parsed = caseSchema.shape.proposal.safeParse(JSON.parse(recorded));

    return parsed.success ? parsed.data : recorded;
  } catch {
    return recorded;
  }
}

function comparableEvidence({ expected, actual }: EvaluationResult) {
  return {
    expected: {
      intent: expected.intent,
      plannerCalls: expected.plannerCalls,
      proposal: expected.proposal,
      groups: expected.groups.map((group) => ({
        category: group.category,
        count: group.count,
        guidance: group.guidance,
      })),
    },
    observed: {
      intent: actual.decision?.kind,
      plannerCalls: actual.metrics?.plannerCalls,
      proposal: expected.proposal && readProposal(actual.metrics?.modelProposal),
      groups: actual.groups.map((group) => ({
        category: group.criteria?.category ?? group.products[0]?.category ?? null,
        count: group.products.length,
        guidance: group.kind === "off-catalog" || group.kind === "clarify" ? group.kind : undefined,
      })),
    },
  };
}

function DiffCell({ value, sign }: { value?: string; sign?: "+" | "−" }) {
  return (
    <td data-change={value === undefined ? undefined : sign}>
      {value !== undefined && (
        <>
          <span className="diff-sign">{sign}</span>
          <code>{value}</code>
        </>
      )}
    </td>
  );
}

function SplitDiff({
  expected,
  observed,
  title,
}: {
  expected: EvidenceDocument;
  observed: EvidenceDocument;
  title: string;
}) {
  const rows = compareLines(expected, observed);

  return (
    <div className="diff-scroll" role="region" aria-label={title} tabIndex={0}>
      <table className="split-diff" aria-label={title}>
        <thead>
          <tr>
            <th scope="col">Expected</th>
            <th scope="col">Observed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- Line positions identify rows in this immutable, server-rendered diff.
            <tr key={index}>
              <DiffCell value={row.expected} sign={row.changed ? "−" : undefined} />
              <DiffCell value={row.observed} sign={row.changed ? "+" : undefined} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EvidenceDiff({ result }: { result: EvaluationResult }) {
  return (
    <details>
      <summary>Expected labels and observed evidence</summary>
      <SplitDiff {...comparableEvidence(result)} title="Comparable fields" />
      <details>
        <summary>Full recorded evidence</summary>
        <SplitDiff
          expected={result.expected}
          observed={result.actual}
          title="Full recorded evidence"
        />
      </details>
    </details>
  );
}
