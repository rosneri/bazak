import { searchCases } from "../packages/features/evaluation/src/domain/search-cases.ts";
import { modelServices } from "./evaluation-services.ts";
import { runSuite } from "./evaluate-suite.ts";

await runSuite(modelServices, "model", searchCases);
