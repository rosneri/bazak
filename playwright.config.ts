import { defineConfig } from "@playwright/test";

const database = process.env.DATABASE_URL;

if (
  !database ||
  !process.env.SHOPPER_TEST_DATABASE ||
  new URL(database).pathname !== "/" + process.env.SHOPPER_TEST_DATABASE ||
  !/^bazak_test_[a-f0-9]{32}$/.test(process.env.SHOPPER_TEST_DATABASE)
) {
  throw new Error("Run pnpm test:e2e to create an isolated local shopper database.");
}

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3174",
    channel: "chrome",
    viewport: { width: 1250, height: 820 },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @bazak/web start:fixture --port 3174",
      url: "http://127.0.0.1:3174",
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: "pnpm --filter @bazak/management exec next start --hostname 127.0.0.1 --port 3175",
      url: "http://127.0.0.1:3175",
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
