import { createFixtureServices } from "../apps/web/src/server/services.test.ts";
import { fixtureCases } from "../packages/features/evaluation/src/domain/cases.ts";
import { runSuite } from "./evaluate-suite.ts";

await runSuite((repo) => createFixtureServices(repo), "fixture", fixtureCases);
