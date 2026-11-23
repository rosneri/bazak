import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { databaseUrl } from "../packages/adapters/evaluation-store/src/database-url.ts";

const task = process.argv[2];

if (!["all", "integration", "browser"].includes(task))
  throw new Error("Choose all, integration or browser.");

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(command, args, { stdio: "inherit", env });

  if (result.error || result.status !== 0)
    throw new Error(command + " did not finish successfully.");
}

const name = "bazak_test_" + randomUUID().replaceAll("-", "");

const url = new URL(databaseUrl());

if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  throw new Error("The test harness requires local Compose PostgreSQL.");

url.pathname = "/" + name;

url.search = "";

const env = { ...process.env, DATABASE_URL: url.toString(), SHOPPER_TEST_DATABASE: name };

const compose = ["compose", "exec", "-T", "postgres"];

run("docker", ["compose", "up", "--detach", "--wait", "postgres"]);

run("docker", [...compose, "createdb", "-U", "bazak", name]);

try {
  run("pnpm", ["db:migrate"], env);

  if (task !== "browser")
    run(
      "pnpm",
      [
        "exec",
        "tsx",
        "--test",
        "packages/adapters/evaluation-store/src/conversations.integration.test.ts",
      ],
      env,
    );

  if (task !== "integration") {
    run("pnpm", ["build:fixture"], env);
    run("pnpm", ["--filter", "@bazak/management", "build"], env);
    run("pnpm", ["exec", "playwright", "test"], env);
  }
} finally {
  run("docker", [...compose, "dropdb", "-U", "bazak", "--force", name]);
}
