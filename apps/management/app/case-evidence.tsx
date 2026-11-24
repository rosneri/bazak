import Link from "next/link";
import type { EvaluationResult } from "@bazak/evaluations";
import { metrics, formatDuration, formatMetricOutcome } from "./evaluation-metrics";

function CaseMetrics({ result }: { result: EvaluationResult }) {
  const { expected, actual } = result;

  return (
    <dl className="evidence-grid">
      {metrics.map((metric) => (
        <div key={metric.key}>
          <dt>{metric.label}</dt>
          <dd>{formatMetricOutcome(result[metric.key])}</dd>
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
        <dd>{formatDuration(result.firstOutputMs)}</dd>
      </div>
      <div>
        <dt>Total duration</dt>
        <dd>{formatDuration(result.durationMs)}</dd>
      </div>
    </dl>
  );
}

export function CaseEvidence({ result }: { result: EvaluationResult }) {
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
      <CaseMetrics result={result} />
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
