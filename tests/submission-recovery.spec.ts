import { test, expect } from "@playwright/test";

test("a lost create acknowledgment restores the first draft in the same chat after reload", async ({
  page,
}) => {
  await page.goto("/");
  const composer = page.getByRole("textbox", { name: "Message the shopping assistant" });
  let threadId = "";
  await page.route("**/api/conversations", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    threadId = route.request().postDataJSON().id;
    await route.fetch();
    await route.abort("connectionreset");
  });
  await composer.fill("Two fragrances under $50");
  await composer.press("Enter");
  await expect(page.locator(".notice[role=alert]")).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(new RegExp(threadId + "$"));
  await expect(composer).toHaveValue("Two fragrances under $50");
  await composer.press("Enter");
  await expect(page.getByRole("heading", { name: "Rose Water" })).toBeVisible();
  await expect(page.locator(".user-message")).toHaveCount(1);
});

for (const accepted of [false, true]) {
  test(`a lost turn acknowledgment recovers after reload (accepted=${accepted})`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New chat" }).click();
    await expect(page).toHaveURL(/\/conversations\//);
    const composer = page.getByRole("textbox", { name: "Message the shopping assistant" });
    const ids: string[] = [];
    await page.route("**/turns", async (route) => {
      ids.push(route.request().postDataJSON().turnId);

      if (ids.length > 1) return route.continue();

      if (accepted) await route.fetch();
      // Also lose the automatic reconciliation read until the tab reloads.
      await page.route("**/api/conversations/*", (check) => check.abort());
      await route.abort("connectionreset");
    });
    const text = "Two fragrances under $50";

    const failedCheck = page.waitForEvent(
      "requestfailed",
      (request) =>
        request.method() === "GET" &&
        request.url().endsWith(page.url().slice(page.url().lastIndexOf("/"))),
    );

    await composer.fill(text);
    await composer.press("Enter");
    await expect(page.locator(".notice[role=alert]")).toBeVisible();
    await failedCheck;
    await page.unroute("**/api/conversations/*");
    await page.reload();

    if (!accepted) {
      await expect(composer).toHaveValue(text);
      await composer.press("Enter");
    }

    await expect(page.getByRole("heading", { name: "Rose Water" })).toBeVisible();
    expect(ids.length).toBe(accepted ? 1 : 2);
    expect(new Set(ids).size).toBe(1);
    await expect(page.locator(".user-message")).toHaveCount(1);
  });
}
