import { EvidenceDiff } from "./evidence-diff";
import Link from "next/link";
import type { EvaluationResult } from "@bazak/evaluations";
import { metricsFor, formatDuration, formatMetricOutcome } from "./evaluation-metrics";

function CaseMetrics({ result }: { result: EvaluationResult }) {
  const { expected, actual } = result;

  return (
    <dl className="evidence-grid">
      {metricsFor(result.profile).map((metric) => (
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

function ConversationTurns({
  result,
  rows,
}: {
  result: EvaluationResult;
  rows: EvaluationResult[];
}) {
  const conversation = result.expected.conversation;

  if (!conversation) return null;

  return (
    <nav aria-label="Conversation turns">
      <h3>{conversation}</h3>
      <ol>
        {rows
          .filter((row) => row.expected.conversation === conversation)
          .map((row) => (
            <li key={row.id}>
              <Link
                href={`/?run=${row.runId}&case=${row.id}#evidence`}
                aria-current={row.id === result.id ? "step" : undefined}
              >
                {row.expected.prompt}
              </Link>
            </li>
          ))}
      </ol>
    </nav>
  );
}

function SetupPrompts({ expected }: Pick<EvaluationResult, "expected">) {
  return (
    <>
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
    </>
  );
}

export function CaseEvidence({
  result,
  rows,
}: {
  result: EvaluationResult;
  rows: EvaluationResult[];
}) {
  const { expected, actual } = result;

  return (
    <section id="evidence" aria-labelledby="case-heading" className="evidence">
      <div className="section-heading">
        <h2 id="case-heading">{result.caseName}</h2>
        <Link href={`/?run=${result.runId}`}>Close evidence</Link>
      </div>
      <ConversationTurns result={result} rows={rows} />
      <blockquote>{expected.prompt}</blockquote>
      <SetupPrompts expected={expected} />
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
      <EvidenceDiff result={result} />
    </section>
  );
}
