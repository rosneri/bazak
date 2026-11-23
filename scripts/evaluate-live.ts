import { createProductionServices } from "../apps/web/src/server/services.production.ts";
import { liveCases } from "../packages/features/evaluation/src/domain/cases.ts";
import { runSuite } from "./evaluate-suite.ts";

await runSuite(createProductionServices, "production", liveCases);
