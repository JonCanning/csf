import { expect, test } from "./fixtures.ts";

test.describe("lottery lifecycle", () => {
	test("open → close → draw", async ({ serverInstance, login, page }) => {
		void serverInstance;
		await login(page);
		await page.goto("/lottery");

		// Initial state — Open button visible
		await expect(page.locator("text=Open Applications")).toBeVisible();

		// Open the window
		await page.locator("button", { hasText: "Open Applications" }).click();
		await expect(page.locator("text=Close Applications")).toBeVisible({
			timeout: 10000,
		});

		// Close the window
		await page.locator("button", { hasText: "Close Applications" }).click();
		await expect(page.locator("text=Run Draw")).toBeVisible({ timeout: 10000 });

		// Fill draw form (no applications in pool, that's fine — empty draw)
		await page.locator("input[data-bind-availablebalance]").fill("200");
		await page.locator("input[data-bind-reserve]").fill("0");
		await page.locator("input[data-bind-grantamount]").fill("40");
		await page.locator("button", { hasText: "Run Draw" }).click();

		// Should redirect to applications page
		await page.waitForURL("**/applications**", { timeout: 10000 });
	});
});
