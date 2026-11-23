import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";

const gate = resolve("apps/web/.next-fixture/hold-reply");

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
  const fullReply = "Here’s what I found. Would you like to narrow the search?";
  await writeFile(gate, "");

  try {
    await input.fill("Two fragrances under $50");
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

  await expect(page.getByRole("status").filter({ hasText: "Reply in progress" })).toHaveCount(0);
  await expect(page.getByText(fullReply, { exact: true })).toBeVisible();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
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
  expect([...external]).toEqual([]);
});
