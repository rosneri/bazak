import { expect, test } from "@playwright/test";

test.use({ colorScheme: "light" });

for (const [app, port] of [
  ["shopper", 3174],
  ["management", 3175],
] as const) {
  test(app + " starts in dark mode even with a light system preference", async ({ page }) => {
    await page.goto("http://127.0.0.1:" + port);
    await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");

    const [background, foreground] = await page.locator("body").evaluate((body) => {
      const style = getComputedStyle(body);
      const context = document.createElement("canvas").getContext("2d")!;

      return [style.backgroundColor, style.color].map((color) => {
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);

        return Math.max(...context.getImageData(0, 0, 1, 1).data.slice(0, 3));
      });
    });

    expect(background).toBeLessThan(64);
    expect(foreground).toBeGreaterThan(192);
  });
}
