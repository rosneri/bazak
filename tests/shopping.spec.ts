import { test, expect, type Page, type Locator } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fixtureCases } from "../packages/features/evaluation/src/domain/cases.ts";

const evidence = "<em data-evidence-marker>O'Brien & Co</em>";

async function expectFragranceLookup(page: Page, input: Locator) {
  const lookupGate = resolve("apps/web/.next-fixture/hold-lookup");
  await writeFile(lookupGate, "");

  try {
    await input.fill("Two fragrances under $50 " + evidence);
    await input.press("Enter");
    await expect(page.getByRole("region", { name: /Loading products/ })).toBeVisible();
    await unlink(lookupGate);
    await expect(page.getByRole("region", { name: /Loading products/ })).toHaveCount(0);

    const card = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole("heading", { name: "Rose Water" }) });

    await expect(card.getByText("$34.00")).toBeVisible();
    await expect(card.getByText(/dewy rose fragrance/)).toBeVisible();
    await expect(card.getByRole("img", { name: "Product image unavailable" })).toBeVisible();
  } finally {
    await rm(lookupGate, { force: true });
  }
}

async function verifyExportAlignment(page: Page, width: number) {
  await page.setViewportSize({ width, height: 820 });
  const header = page.locator(".conversation-header");
  await expect(header).toBeVisible();

  const aligned = await header.evaluate((element) => {
    const [heading, actions] = Array.from(element.children, (child) =>
      child.getBoundingClientRect(),
    );

    const centered =
      Math.abs((heading.top + heading.bottom - actions.top - actions.bottom) / 2) < 2;

    return centered && actions.left >= heading.right && actions.right <= window.innerWidth;
  });

  expect(aligned).toBe(true);
}

async function verifyFollowupInputs(page: Page) {
  const panel = page.locator(".turn-diagnostics").last();
  await panel.locator(":scope > summary").click();
  await expect(panel.locator("li > details[open]")).toHaveCount(0);
  const intent = panel.locator("li").filter({ hasText: "Intent model" });
  const decision = panel.locator("li").filter({ hasText: "Application decision" });
  await intent.locator("summary").first().click();
  await intent.getByText("Input", { exact: true }).click();
  await expect(intent.getByText("Model input", { exact: true })).toBeVisible();
  const modelInput = intent.locator("pre").first();
  await expect(modelInput).toBeVisible();
  await expect(modelInput).toContainText("Show me a cheaper one.");
  await expect(modelInput).toContainText("Rose Water");
  await expect(intent.locator("pre").last()).toBeVisible();
  await expect(decision.locator(":scope > details[open]")).toHaveCount(0);
  await decision.locator("summary").first().click();
  await decision.getByText("Input", { exact: true }).click();
  await expect(decision.getByText("Routing arguments", { exact: true })).toBeVisible();
  await expect(decision.locator("pre").first()).toContainText('"kind": "cheaper"');
  await expect(decision.locator("pre").last()).toBeVisible();
  await expect(decision.locator("pre").last()).toContainText('"kind": "discover"');
  await decision.getByText("Output", { exact: true }).click();
  await expect(decision.locator("pre").last()).toBeHidden();
}

async function verifyMarkdownActions(page: Page) {
  await verifyExportAlignment(page, 375);
  await verifyExportAlignment(page, 1250);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.getByText("Conversation copied.")).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.md$/);
  const path = await download.path();
  expect(await readFile(path!, "utf8")).toBe(copied);

  for (const expected of [
    "## Turn 2",
    "**Input**",
    "Routing arguments",
    "**Output**",
    "Light Citrus",
    "Debug steps",
    "Intent model",
    "catalog requests started",
  ])
    expect(copied).toContain(expected);
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
  await expectFragranceLookup(page, input);
  await expect(page.getByRole("status").filter({ hasText: "Reply in progress" })).toHaveCount(0);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await expect(page.locator(".user-message").first()).toHaveText(
    "Two fragrances under $50 " + evidence,
  );
  await expect(page.locator("[data-evidence-marker]")).toHaveCount(0);
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
  await verifyFollowupInputs(page);
  await verifyMarkdownActions(page);
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
  const comparison = page.getByRole("table", { name: "Comparable fields" });
  await expect(comparison.getByRole("columnheader")).toHaveText(["Expected", "Observed"]);
  await expect(
    comparison.locator('td[data-change="−"]').filter({ hasText: '"intent": "discover"' }),
  ).toBeVisible();
  await page.getByText("Full recorded evidence", { exact: true }).click();
  await expect(page.getByRole("table", { name: "Full recorded evidence" })).toContainText(evidence);
  await expect(page.locator("[data-evidence-marker]")).toHaveCount(0);
});

test("the chat explains an empty lookup and explains an unsupported category request after reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(page).toHaveURL(/\/conversations\/[\da-f-]{36}$/);
  const input = page.getByRole("textbox", { name: "Message the shopping assistant" });
  await input.fill("Find a lamp under $1");
  await input.press("Enter");
  const lookup = page.locator(".exchange").first();
  await lookup.getByText("Debug steps · Attempt 1").click();
  await expect(lookup).toContainText("No matches");
  await expect(lookup).toContainText("empty · 0 displayed · exhaustive");
  await input.fill("What categories do you have?");
  await input.press("Enter");
  await expect(page.locator(".reply-text").last()).toContainText(
    "3. Check the current price or stock",
  );
  await page.reload();
  const browse = page.locator(".exchange").last();
  await browse.getByText("Debug steps · Attempt 1").click();
  await expect(browse.locator("li").first()).toContainText('"off-catalog"');
  await expect(browse).toContainText("0 catalog requests started");
});
