import { readFile } from "node:fs/promises";
import { evaluationBatchSchema } from "@bazak/evaluations";
import { saveResults } from "./results.ts";
import { database } from "./client.ts";

async function importFile() {
  const filename = process.argv[2];

  if (!filename) throw new Error("Pass the path of a JSON evaluation batch.");
  const batch = evaluationBatchSchema.parse(JSON.parse(await readFile(filename, "utf8")));
  const added = await saveResults(batch);
  console.log(`Imported ${added} new results from ${batch.length} observations.`);
}

try {
  await importFile();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Evaluation import failed.");
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}
