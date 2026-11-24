import Link from "next/link";
import {
  evaluationUsage,
  evaluationPassed,
  metricCount,
  type EvaluationResult,
} from "@bazak/evaluations";
import { metricsFor, formatDuration, formatMetricOutcome } from "./evaluation-metrics";

function caseOutcomeLabel(row: EvaluationResult) {
  if (row.outcome === "execution-error") return "Execution error";

  return evaluationPassed(row) ? "Passed" : "Disagreed";
}

export function RunScores({ rows }: { rows: EvaluationResult[] }) {
  return (
    <dl className="scores">
      <div>
        <dt>Run usage (including setup)</dt>
        <dd>{evaluationUsage(rows)}</dd>
      </div>
      {metricsFor(rows[0].profile).map((metric) => {
        const { passed, scored } = metricCount(rows, metric.key);

        return (
          <div key={metric.key}>
            <dt>{metric.label}</dt>
            <dd>
              {passed}
              <span> / {scored}</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function CaseResultsTable({
  rows,
  selected,
}: {
  rows: EvaluationResult[];
  selected?: EvaluationResult;
}) {
  return (
    <div className="table-scroll" role="region" aria-label="Case results table" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th scope="col">Case</th>
            <th scope="col">Outcome</th>
            <th scope="col">Tokens and estimated cost</th>
            {metricsFor(rows[0].profile).map((metric) => (
              <th key={metric.key} scope="col">
                {metric.label}
              </th>
            ))}
            <th scope="col" className="number">
              First output
            </th>
            <th scope="col" className="number">
              Duration
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <CaseResultRow key={row.id} row={row} selected={row.id === selected?.id} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CaseResultRow({ row, selected }: { row: EvaluationResult; selected: boolean }) {
  return (
    <tr data-selected={selected}>
      <th scope="row">
        <Link href={`/?run=${row.runId}&case=${row.id}#evidence`}>{row.caseName}</Link>
      </th>
      <td className={evaluationPassed(row) ? "" : "attention"}>{caseOutcomeLabel(row)}</td>
      <td>{evaluationUsage([row])}</td>
      {metricsFor(row.profile).map((metric) => (
        <td key={metric.key} className={row[metric.key] === null ? "muted" : ""}>
          {formatMetricOutcome(row[metric.key])}
        </td>
      ))}
      <td className="number">{formatDuration(row.firstOutputMs)}</td>
      <td className="number">{formatDuration(row.durationMs)}</td>
    </tr>
  );
}
