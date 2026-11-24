import { test, expect, type Page, type Locator } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fixtureCases } from "../packages/features/evaluation/src/domain/cases.ts";

const gate = resolve("apps/web/.next-fixture/hold-reply");

const evidence = "<em data-evidence-marker>O'Brien & Co</em>";

const fullReply = "Here’s what I found. Would you like to narrow the search?";

async function expectPartialFragranceReply(page: Page, input: Locator) {
  await writeFile(gate, "");

  try {
    await input.fill("Two fragrances under $50 " + evidence);
    await input.press("Enter");
    await expect(page.getByText("Here’s what I found.", { exact: true })).toBeVisible();
    await expect(page.getByText(fullReply, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Reply in progress" })).toBeVisible();

    const card = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole("heading", { name: "Rose Water" }) });

    await expect(card.getByText("$34.00")).toBeVisible();
    await expect(card.getByText(/dewy rose fragrance/)).toBeVisible();
    await expect(card.getByRole("img", { name: "Product image unavailable" })).toBeVisible();
  } finally {
    await unlink(gate);
  }
}

async function expectSavedFixtureReport(page: Page) {
  await page.goto("http://127.0.0.1:3175");

  // Start the run after the dashboard server and page are already live.
  const output = execFileSync("pnpm", ["evaluate"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

  const run = output.match(/Saved fixture run ([\da-f-]{36})/i)?.[1];
  expect(run).toBeTruthy();
  await page.goto("http://127.0.0.1:3175/?run=" + run);
  await expect(page.getByRole("heading", { name: "Fixture report" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Strict budget/ })).toContainText("Passed");
}

test("a shopper sees a streamed reply, reloads, refines and reopens it alongside a scored run", async ({
  page,
}) => {
  const external = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());

    if (url.protocol.startsWith("http") && url.hostname !== "127.0.0.1") external.add(url.hostname);
  });
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "Message the shopping assistant" });
  await expect(input).toBeVisible();
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(page).toHaveURL(/\/conversations\/[\da-f-]{36}$/);
  const url = page.url();
  await expectPartialFragranceReply(page, input);
  await expect(page.getByRole("status").filter({ hasText: "Reply in progress" })).toHaveCount(0);
  await expect(page.getByText(fullReply, { exact: true })).toBeVisible();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await expect(page.locator(".user-message").first()).toHaveText(
    "Two fragrances under $50 " + evidence,
  );
  await expect(page.locator("[data-evidence-marker]")).toHaveCount(0);
  await expect(page.getByText(fullReply, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cedar Wood" })).toBeVisible();
  await input.fill("Show me a cheaper one.");
  await input.press("Enter");
  await expect(page.getByRole("heading", { name: "Light Citrus" })).toBeVisible();
  await expect(page.getByText("$18.00")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Reply in progress" })).toHaveCount(0);
  await page.getByRole("link", { name: "Bazak home" }).click();
  await page
    .getByRole("navigation", { name: "Chat history" })
    .getByRole("link", { name: /Two fragrances/ })
    .click();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("heading", { name: "Light Citrus" })).toBeVisible();
  await expectSavedFixtureReport(page);
  expect([...external]).toEqual([]);
});

async function verifyPageSecurityPolicy(page: Page, url: string) {
  const response = await page.goto(url);
  const headers = response?.headers();
  const policy = headers?.["content-security-policy"];
  const nonce = policy?.match(/script-src [^;]*'nonce-([^']+)'/)?.[1];

  const inlineNonce = await page
    .locator("script:not([src])")
    .first()
    .evaluate((element) => (element instanceof HTMLScriptElement ? element.nonce : ""));

  expect(nonce).toBeTruthy();
  expect(inlineNonce).toBe(nonce);
  expect(policy).toContain("'strict-dynamic'");
  expect(policy).not.toMatch(/'unsafe-(?:inline|eval)'/);
  expect(headers?.["x-content-type-options"]).toBe("nosniff");
  expect(headers?.["referrer-policy"]).toBe("no-referrer");
  expect(headers?.["cache-control"]).toContain("no-store");

  return nonce;
}

async function importEvaluationEvidence() {
  const directory = await mkdtemp(join(tmpdir(), "bazak-report-"));
  const runId = randomUUID();
  const id = randomUUID();
  const expected = { ...fixtureCases[1], name: evidence, prompt: evidence };

  try {
    const file = join(directory, "result.json");

    await writeFile(
      file,
      JSON.stringify([
        {
          id,
          runId,
          profile: "fixture",
          caseName: evidence,
          recordedAt: new Date().toISOString(),
          outcome: "execution-error",
          expected,
          actual: { decision: null, groups: [], metrics: null },
          intentMatch: null,
          constraintsSatisfied: null,
          correctAbstention: null,
          firstOutputMs: null,
          durationMs: 10,
          detail: "Fixture evidence",
        },
      ]),
    );

    execFileSync("pnpm", ["eval:import", file], { stdio: "pipe" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  return { runId, id };
}

test("loopback pages enforce a fresh script nonce and render imported evidence as text", async ({
  page,
}) => {
  const management = "http://127.0.0.1:3175";

  const previousNonce = await verifyPageSecurityPolicy(page, "/");
  await expect(page.getByRole("button", { name: "New chat" })).toBeVisible();
  expect(await verifyPageSecurityPolicy(page, "/")).not.toBe(previousNonce);

  const { runId, id } = await importEvaluationEvidence();
  await verifyPageSecurityPolicy(page, `${management}/?run=${runId}&case=${id}`);
  await expect(page.getByRole("heading", { name: evidence })).toBeVisible();
  await expect(page.locator("blockquote")).toHaveText(evidence);
  await page.getByText("Expected labels and observed evidence").click();
  await expect(page.locator("pre")).toContainText(evidence);
  await expect(page.locator("[data-evidence-marker]")).toHaveCount(0);
});
