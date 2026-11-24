import Link from "next/link";
import { z } from "zod";
import { Button } from "@bazak/ui/components/button";
import type { EvaluationResult } from "@bazak/evaluations";
import { CaseResultsTable, RunScores } from "./case-results";
import { CaseEvidence } from "./case-evidence";
import { listRuns, readRun } from "@bazak/evaluation-store";

export const dynamic = "force-dynamic";

const idSchema = z.uuid().describe("The UUID of a recorded evaluation run.");

const date = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "UTC",
});

const profileLabel = (profile: string) => (profile === "fixture" ? "Fixture" : "Production");

interface PageProps {
  searchParams: Promise<{ run?: string | string[]; case?: string | string[] }>;
}

type RecordedRuns = Awaited<ReturnType<typeof listRuns>>;

function RunPicker({ runs, currentRunId }: { runs: RecordedRuns; currentRunId?: string }) {
  return (
    <div className="page-heading">
      <div>
        <h1>Evaluation runs</h1>
        <p className="muted">Saved scores and response timings for the shopping copilot.</p>
      </div>
      {runs.length > 0 && (
        <form method="get">
          <label htmlFor="run">Recorded run</label>
          <div className="control-row">
            <select id="run" name="run" defaultValue={currentRunId ?? runs[0].runId}>
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
  );
}

function StorageUnavailable() {
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

function EmptyReport({ hasRuns }: { hasRuns: boolean }) {
  return (
    <div className="notice">
      <h2>{hasRuns ? "Run not found" : "No evaluation runs yet"}</h2>
      {hasRuns ? (
        <Link href="/">Open the latest run</Link>
      ) : (
        <p>
          From the repository root, run <code>pnpm evaluate</code> to record a labeled fixture
          suite. Then reload this page.
        </p>
      )}
    </div>
  );
}

function includeSelectedRun(runs: RecordedRuns, rows: EvaluationResult[]): RecordedRuns {
  const first = rows[0];

  if (!first || runs.some((run) => run.runId === first.runId)) return runs;

  return [
    ...runs,
    {
      runId: first.runId,
      profile: first.profile,
      recordedAt: new Date(rows[rows.length - 1].recordedAt),
    },
  ];
}

export default async function EvaluationRunsPage({ searchParams }: PageProps) {
  const query = await searchParams;
  let runs: RecordedRuns;
  let rows: EvaluationResult[] = [];

  try {
    runs = await listRuns();
    const requested = query.run === undefined ? runs[0]?.runId : idSchema.safeParse(query.run).data;

    if (requested) rows = await readRun(requested);
  } catch {
    return <StorageUnavailable />;
  }

  const first = rows[0];

  runs = includeSelectedRun(runs, rows);

  const selected = rows.find((row) => row.id === query.case);

  return (
    <>
      <RunPicker runs={runs} currentRunId={first?.runId} />
      {!first ? (
        <EmptyReport hasRuns={runs.length > 0} />
      ) : (
        <>
          <div className="report-heading">
            <h2>{profileLabel(first.profile)} report</h2>
            <span>{rows.length} cases</span>
          </div>
          <RunScores rows={rows} />
          <div className="section-heading">
            <h2>Case results</h2>
          </div>
          <CaseResultsTable rows={rows} selected={selected} />
          {selected && <CaseEvidence result={selected} />}
        </>
      )}
    </>
  );
}
