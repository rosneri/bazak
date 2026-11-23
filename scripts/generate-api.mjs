import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { generate } from "orval";

const web = "apps/web";

const api = join(web, "src/api");

const generated = join(api, "generated");

const check = process.argv.includes("--check");

// A sibling directory gives the temporary client identical relative imports.
const output = await mkdtemp(join(api, ".orval-"));

const mutator = join(api, "fetch.ts");

const stream = { mutator: { path: mutator, name: "streamFetch", inferred: true } };

try {
  await generate(
    {
      input: {
        target: join(web, "openapi.yaml"),
        override: {
          // Orval's Zod writer generates component schemas but omits aliases for
          // components.responses. Resolve local Response Objects before generating hooks.
          transformer(spec) {
            for (const path of Object.values(spec.paths)) {
              for (const operation of Object.values(path)) {
                for (const [status, response] of Object.entries(operation.responses ?? {})) {
                  if (response.$ref?.startsWith("#/components/responses/")) {
                    operation.responses[status] =
                      spec.components.responses[response.$ref.split("/").at(-1)];
                  }
                }
              }
            }

            return spec;
          },
        },
      },
      output: {
        client: "react-query",
        httpClient: "fetch",
        target: join(output, "hooks.ts"),
        schemas: { type: "zod", mode: "single", path: join(output, "models.ts") },
        packageJson: join(web, "package.json"),
        tsconfig: join(web, "tsconfig.json"),
        urlEncodeParameters: true,
        override: {
          zod: {
            version: 4,
            strict: { body: true },
            generateReusableSchemas: true,
            generateDiscriminatedUnion: true,
          },
          query: { version: 5, signal: true },
          fetch: { includeHttpResponseReturnType: false, runtimeValidation: true },
          includeZodSchemaInArguments: true,
          mutator: { path: mutator, name: "jsonFetch" },
          operations: { sendTurn: stream, retryTurn: stream },
        },
      },
    },
    process.cwd(),
    { throwOnError: true },
  );

  execFileSync("oxfmt", ["--write", output], { stdio: "inherit" });

  if (check) {
    execFileSync("git", ["diff", "--no-index", "--stat", "--exit-code", "--", generated, output], {
      stdio: "inherit",
    });
  } else {
    // Publish only after Orval and the formatter have both succeeded.
    await cp(output, generated, { recursive: true });

    const written = new Set(await readdir(output));

    const obsolete = (await readdir(generated)).filter((name) => !written.has(name));

    await Promise.all(obsolete.map((name) => rm(join(generated, name), { recursive: true })));
  }
} finally {
  await rm(output, { recursive: true, force: true });
}
