import { expect, test } from "@playwright/test";

test("a single search reveals its summary alongside the cards and reopens in full", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await page.getByRole("button", { name: "New chat" }).click();
  const input = page.getByRole("textbox", { name: "Message the shopping assistant" });
  await input.fill("Find two fragrances under $50");

  const partial = page.waitForFunction(() => {
    const group = document.querySelector(".preview .results:has(.product-card h4)");
    const summary = group?.querySelector(".group-message")?.textContent?.trim();

    return summary && "Showing 2 matching products.".startsWith(summary) ? summary : "";
  });

  const [first] = await Promise.all([partial, input.press("Enter")]);
  const prefix = await first.jsonValue();
  const saved = page.locator(".exchange:not(.preview) .group-message");
  await expect(saved).toContainText("All catalog pages for this lookup were checked.");
  const complete = await saved.innerText();
  expect(complete.startsWith(prefix)).toBe(true);

  await page.reload();
  await expect(saved).toHaveText(complete);
  await expect(page.getByRole("heading", { name: "Rose Water" })).toBeVisible();
});
