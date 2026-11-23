import { isDeepStrictEqual } from "node:util";
import {
  evaluationBatchSchema,
  evaluationResultSchema,
  type EvaluationResult,
} from "@bazak/evaluations";
import { database } from "./client.ts";
import type { EvaluationResult as StoredResult } from "./generated/client.ts";

function readResult(row: StoredResult) {
  return evaluationResultSchema.parse({ ...row, recordedAt: row.recordedAt.toISOString() });
}

export async function saveResults(input: EvaluationResult[], client = database) {
  const batch = evaluationBatchSchema.parse(input).map((row) => ({
    ...row,
    id: row.id.toLowerCase(),
    runId: row.runId.toLowerCase(),
    recordedAt: new Date(row.recordedAt).toISOString(),
  }));

  // A stable order prevents opposing import orders from holding each other's unique-index locks.
  batch.sort((left, right) => left.id.localeCompare(right.id));

  return client.$transaction(async (tx) => {
    // Imports are infrequent. Serialize this short check so a run cannot acquire two profiles.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1629, 1)`;
    const runIds = [...new Set(batch.map((row) => row.runId))];

    const previous = await tx.evaluationResult.findMany({
      where: { runId: { in: runIds } },
      distinct: ["runId", "profile"],
      select: { runId: true, profile: true },
    });

    const profiles = new Map<string, string>();

    for (const item of [...previous, ...batch]) {
      const profile = profiles.get(item.runId);

      if (profile && profile !== item.profile)
        throw new Error("A run cannot contain more than one profile.");
      profiles.set(item.runId, item.profile);
    }

    const writes = await tx.evaluationResult.createMany({ data: batch, skipDuplicates: true });

    const rows = await tx.evaluationResult.findMany({
      where: { id: { in: batch.map((result) => result.id) } },
    });

    const stored = new Map(rows.map((row) => [row.id, readResult(row)]));

    for (const item of batch) {
      if (!isDeepStrictEqual(stored.get(item.id), item))
        throw new Error("This result ID already has different evidence.");
    }

    return writes.count;
  });
}

export async function listRuns(client = database) {
  const groups = await client.evaluationResult.groupBy({
    by: ["runId", "profile"],
    _max: { recordedAt: true },
    orderBy: [{ _max: { recordedAt: "desc" } }, { runId: "desc" }],
    take: 30,
  });

  return groups.map(({ runId, profile, _max: latest }) => ({
    runId,
    profile,
    recordedAt: latest.recordedAt,
  }));
}

export async function readRun(runId: string, client = database) {
  const rows = await client.evaluationResult.findMany({
    where: { runId },
    orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
  });

  return rows.map(readResult);
}
