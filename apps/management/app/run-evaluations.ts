"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLoopbackOrigin } from "@bazak/shared/loopback-origin";
import { createFixtureServices } from "../../web/src/server/services.test";
import { createProductionServices } from "../../web/src/server/services.production";
import { fixtureCases, liveCases } from "../../../packages/features/evaluation/src/domain/cases";
import { modelServices, harnessServices } from "../../../scripts/evaluation-services";
import {
  searchCases,
  harnessCases,
} from "../../../packages/features/evaluation/src/domain/search-cases";
import { recordSuite } from "../../../scripts/evaluate-suite";

async function recordEvaluationReports() {
  await recordSuite((repo) => createFixtureServices(repo), "fixture", fixtureCases);

  await recordSuite(harnessServices, "harness", harnessCases);
  await recordSuite((repo) => createProductionServices(repo), "production", liveCases);

  return (await recordSuite(modelServices, "model", searchCases)).runId;
}

let activeRun: Promise<string> | undefined;

export async function runEvaluations() {
  const request = await headers();
  const origin = getLoopbackOrigin(request, process.env.PORT ?? "3002");

  if (!origin || origin !== request.get("origin"))
    return "Open the local dashboard to run evaluations.";

  activeRun ??= recordEvaluationReports().finally(() => {
    activeRun = undefined;
  });

  let runId: string;

  try {
    runId = await activeRun;
  } catch {
    return "Could not save the evaluation reports. Check the local database and try again.";
  }

  redirect("/?run=" + runId);
}
