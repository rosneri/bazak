import Link from "next/link";
import { z } from "zod";
import { Button } from "@bazak/ui/components/button";
import {
  evaluationPassed,
  metricCount,
  type EvaluationResult,
  type MetricName,
} from "@bazak/evaluations";
import { listRuns, readRun } from "@bazak/evaluation-store";

export const dynamic = "force-dynamic";

const idSchema = z.uuid().describe("The UUID of a recorded evaluation run.");

const metrics: { key: MetricName; label: string }[] = [
  { key: "intentMatch", label: "Intent match" },
  { key: "constraintsSatisfied", label: "Product constraints" },
  { key: "correctAbstention", label: "Correct abstention" },
];

const date = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "UTC",
});

const profileLabel = (profile: string) => (profile === "fixture" ? "Fixture" : "Production");

function status(row: EvaluationResult) {
  if (row.outcome === "execution-error") return "Execution error";

  return evaluationPassed(row) ? "Passed" : "Disagreed";
}

function duration(value: number | null) {
  return value === null ? "—" : value + " ms";
}

function checkText(value: boolean | null) {
  return value === null ? "Unscored" : value ? "Pass" : "Fail";
}

function CaseEvidence({ result }: { result: EvaluationResult }) {
  const { expected, actual } = result;

  return (
    <section id="evidence" aria-labelledby="case-heading" className="evidence">
      <div className="section-heading">
        <h2 id="case-heading">{result.caseName}</h2>
        <Link href={`/?run=${result.runId}`}>Close evidence</Link>
      </div>
      <blockquote>{expected.prompt}</blockquote>
      {expected.priorChat && (
        <p>
          <strong>Earlier chat</strong> {expected.priorChat}
        </p>
      )}
      {expected.priorTurn && (
        <p>
          <strong>Earlier turn</strong> {expected.priorTurn}
        </p>
      )}
      <dl className="evidence-grid">
        {metrics.map((metric) => (
          <div key={metric.key}>
            <dt>{metric.label}</dt>
            <dd>{checkText(result[metric.key])}</dd>
          </div>
        ))}
        <div>
          <dt>Expected intent</dt>
          <dd>{expected.intent}</dd>
        </div>
        <div>
          <dt>Observed intent</dt>
          <dd>{actual.decision?.kind ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Planner calls</dt>
          <dd>
            {actual.metrics?.plannerCalls ?? "—"} observed / {expected.plannerCalls} expected
          </dd>
        </div>
        <div>
          <dt>Catalog calls</dt>
          <dd>{actual.metrics?.catalogCalls ?? "—"}</dd>
        </div>
        <div>
          <dt>First output</dt>
          <dd>{duration(result.firstOutputMs)}</dd>
        </div>
        <div>
          <dt>Total duration</dt>
          <dd>{duration(result.durationMs)}</dd>
        </div>
      </dl>
      {result.detail && <p role="status">{result.detail}</p>}
      {actual.groups.map((group) => (
        <div key={JSON.stringify(group)} className="group">
          <h3>{group.label}</h3>
          <p>{group.message}</p>
          {group.products.length > 0 && (
            <ul>
              {group.products.map((product) => (
                <li key={product.id}>
                  {product.title}{" "}
                  <span className="muted">
                    (${product.price.toFixed(2)}, {product.stock} in stock)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <details>
        <summary>Expected labels and observed evidence</summary>
        <pre>{JSON.stringify({ expected, actual }, null, 2)}</pre>
      </details>
    </section>
  );
}

interface PageProps {
  searchParams: Promise<{ run?: string | string[]; case?: string | string[] }>;
}

export default async function Page({ searchParams }: PageProps) {
  const query = await searchParams;
  let runs: Awaited<ReturnType<typeof listRuns>>;
  let rows: EvaluationResult[] = [];

  try {
    runs = await listRuns();
    const requested = query.run === undefined ? runs[0]?.runId : idSchema.safeParse(query.run).data;

    if (requested) rows = await readRun(requested);
  } catch {
    return (
      <>
        <h1>Evaluation runs</h1>
        <div className="notice" role="alert">
          <h2>Evaluation storage is unavailable</h2>
          <p>
            Check the local database with <code>pnpm db:up</code>, then reload this report.
          </p>
          <Button asChild variant="outline">
            <Link href="/">Reload report</Link>
          </Button>
        </div>
      </>
    );
  }

  const first = rows[0];

  if (first && !runs.some((run) => run.runId === first.runId)) {
    runs = [
      ...runs,
      {
        runId: first.runId,
        profile: first.profile,
        recordedAt: new Date(rows[rows.length - 1].recordedAt),
      },
    ];
  }

  const selected = rows.find((row) => row.id === query.case);

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Evaluation runs</h1>
          <p className="muted">Saved scores and response timings for the shopping copilot.</p>
        </div>
        {runs.length > 0 && (
          <form method="get">
            <label htmlFor="run">Recorded run</label>
            <div className="control-row">
              <select id="run" name="run" defaultValue={first?.runId ?? runs[0].runId}>
                {runs.map((run) => (
                  <option key={run.runId} value={run.runId}>
                    {profileLabel(run.profile)}, {date.format(run.recordedAt ?? 0)} UTC
                  </option>
                ))}
              </select>
              <Button type="submit" variant="outline">
                Open run
              </Button>
            </div>
          </form>
        )}
      </div>
      {!first ? (
        <div className="notice">
          <h2>{runs.length ? "Run not found" : "No evaluation runs yet"}</h2>
          {runs.length ? (
            <Link href="/">Open the latest run</Link>
          ) : (
            <p>
              From the repository root, run <code>pnpm evaluate</code> to record a labeled fixture
              suite. Then reload this page.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="report-heading">
            <h2>{profileLabel(first.profile)} report</h2>
            <span>{rows.length} cases</span>
          </div>
          <dl className="scores">
            {metrics.map((metric) => {
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
          <div className="section-heading">
            <h2>Case results</h2>
          </div>
          <div className="table-scroll" role="region" aria-label="Case results table" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Case</th>
                  <th scope="col">Outcome</th>
                  {metrics.map((metric) => (
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
                  <tr key={row.id} data-selected={row.id === selected?.id}>
                    <th scope="row">
                      <Link href={`/?run=${row.runId}&case=${row.id}#evidence`}>
                        {row.caseName}
                      </Link>
                    </th>
                    <td className={evaluationPassed(row) ? "" : "attention"}>{status(row)}</td>
                    {metrics.map((metric) => (
                      <td key={metric.key} className={row[metric.key] === null ? "muted" : ""}>
                        {checkText(row[metric.key])}
                      </td>
                    ))}
                    <td className="number">{duration(row.firstOutputMs)}</td>
                    <td className="number">{duration(row.durationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected && <CaseEvidence result={selected} />}
        </>
      )}
    </>
  );
}
