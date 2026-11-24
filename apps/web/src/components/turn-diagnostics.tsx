import { formatUsage, attemptUsage } from "@bazak/conversation/domain/usage";
import type { Turn } from "@bazak/conversation/domain/turn";
import { attemptTiming, debugStages } from "./debug-stages";

export function TurnDiagnostics({ turn }: { turn: Turn }) {
  return (
    <details className="turn-diagnostics">
      <summary>Debug steps · Attempt {turn.attempt}</summary>
      <p>{formatUsage(attemptUsage(turn.metrics))}</p>
      <p>{attemptTiming(turn)}</p>
      <ol>
        {debugStages(turn).map(([label, status, inputs, output], index) => (
          <li key={label}>
            <details>
              <summary>
                <span className="step-number">{index + 1}.</span> <strong>{label}</strong> ·{" "}
                {status}
              </summary>
              <details>
                <summary>Input</summary>
                {inputs.map(({ name, value }) => (
                  <div className="debug-input" key={name}>
                    <strong>{name}</strong>
                    <pre>{value}</pre>
                  </div>
                ))}
              </details>
              <details open>
                <summary>Output</summary>
                <pre>{output}</pre>
              </details>
            </details>
          </li>
        ))}
      </ol>
    </details>
  );
}
