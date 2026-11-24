import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspace = fileURLToPath(new URL("../../", import.meta.url));

const rule = "anti-slop(require-named-effect)";

const anonymousWorkflow = "() => { connect(); subscribe(); }";

const rejected = {
  "direct-import": `import { useEffect } from "react"; useEffect(${anonymousWorkflow}, []);`,
  "aliased-import": `import { useEffect as onMount } from "react"; onMount(${anonymousWorkflow}, []);`,
  "namespace-import": `import * as React from "react"; React.useEffect(${anonymousWorkflow}, []);`,
  "default-import": `import React from "react"; React.useEffect(${anonymousWorkflow}, []);`,
};

const accepted = {
  "named-callback": `import { useEffect } from "react"; function subscribeToCart() { connect(); subscribe(); } useEffect(subscribeToCart, []);`,
  "named-function-expression": `import { useEffect } from "react"; useEffect(function subscribeToCart() { connect(); subscribe(); }, []);`,
  "helper-delegation": `import { useEffect } from "react"; useEffect(() => subscribeToCart(cart), [cart]);`,
  "shadowed-import": `import { useEffect } from "react"; export function configure(useEffect) { useEffect(${anonymousWorkflow}, []); } export { useEffect };`,
  "shadowed-namespace": `import * as React from "react"; export function configure(React) { React.useEffect(${anonymousWorkflow}, []); } export { React };`,
  "unrelated-module": `import { useEffect } from "./other"; useEffect(${anonymousWorkflow}, []);`,
};

test("Oxlint requires named React effects and permits delegation to named helpers", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "bazak-effect-rule-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixtures = Object.entries({ ...rejected, ...accepted });
  await Promise.all(fixtures.map(([name, code]) => writeFile(join(directory, name + ".js"), code)));

  const result = spawnSync(
    join(workspace, "node_modules", ".bin", "oxlint"),
    ["-c", join(workspace, ".oxlintrc.json"), "-f", "json", directory],
    { cwd: workspace, encoding: "utf8" },
  );

  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.number_of_files, fixtures.length);
  const violations = report.diagnostics.filter((diagnostic) => diagnostic.code === rule);

  assert.deepEqual(
    violations.map((diagnostic) => basename(diagnostic.filename, ".js")).sort(),
    Object.keys(rejected).sort(),
  );
});
