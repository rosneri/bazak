import { harnessCases } from "../packages/features/evaluation/src/domain/search-cases.ts";
import { harnessServices } from "./evaluation-services.ts";
import { runSuite } from "./evaluate-suite.ts";

await runSuite(harnessServices, "harness", harnessCases);
