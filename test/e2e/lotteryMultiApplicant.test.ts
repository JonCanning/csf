import {
	closeLotteryWindow,
	expect,
	openLotteryWindow,
	runLotteryDraw,
	submitApplication,
	test,
} from "./fixtures.ts";

const APPLICANTS: [string, string][] = [
	["Alice Lottery", "07700900200"],
	["Bob Lottery", "07700900201"],
	["Carol Lottery", "07700900202"],
];

test.describe("lottery with multiple applicants", () => {
	test("more applicants than slots → some selected, some not", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await login(page);

		await openLotteryWindow(page);

		// Submit 3 applications
		for (const [name, phone] of APPLICANTS) {
			const { url } = await submitApplication(page, { name, phone });
			expect(url).toContain("status=accepted");
		}

		// Verify all 3 show as accepted
		await page.goto("/applications");
		for (const [name] of APPLICANTS) {
			const row = page.locator("tr", { hasText: name });
			await expect(row).toContainText("Accepted", { timeout: 5000 });
		}

		// Close window and draw with budget for only 2 slots (80 / 40 = 2)
		await closeLotteryWindow(page);
		await runLotteryDraw(page, { balance: 80 });

		// Count selected vs not_selected using auto-retrying assertions
		let selectedCount = 0;
		let notSelectedCount = 0;
		for (const [name] of APPLICANTS) {
			const row = page.locator("tr", { hasText: name });
			// Wait for row status to settle (either Selected or Not Selected)
			await expect(row).toContainText(/Selected|Not Selected/, {
				timeout: 5000,
			});
			const text = await row.textContent();
			if (text?.includes("Not Selected")) {
				notSelectedCount++;
			} else if (text?.includes("Selected")) {
				selectedCount++;
			}
		}

		expect(selectedCount).toBe(2);
		expect(notSelectedCount).toBe(1);
	});

	test("not-selected applicant shows correct status in detail panel", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await login(page);

		await openLotteryWindow(page);

		// 2 applicants, budget for 1
		const { url: url1 } = await submitApplication(page, {
			name: "Winner One",
			phone: "07700900210",
		});
		expect(url1).toContain("status=accepted");

		const { url: url2 } = await submitApplication(page, {
			name: "Loser One",
			phone: "07700900211",
		});
		expect(url2).toContain("status=accepted");

		await closeLotteryWindow(page);
		await runLotteryDraw(page, { balance: 40 }); // Only 1 slot

		// Find the not-selected applicant and check their detail panel
		await page.goto("/applications");
		let notSelectedName: string | null = null;
		for (const name of ["Winner One", "Loser One"]) {
			const row = page.locator("tr", { hasText: name });
			await expect(row).toContainText(/Selected|Not Selected/, {
				timeout: 5000,
			});
			const text = await row.textContent();
			if (text?.includes("Not Selected")) {
				notSelectedName = name;
				break;
			}
		}
		if (!notSelectedName)
			throw new Error("Expected one applicant to be not selected");

		// Click on the not-selected row to open detail panel
		const notSelectedRow = page.locator("tr", { hasText: notSelectedName });
		await notSelectedRow.click();
		await expect(page.locator("#panel")).toContainText("Not Selected", {
			timeout: 10000,
		});
	});

	test("mixed bank and cash applicants both get grants", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await login(page);

		await openLotteryWindow(page);

		// Submit one cash, one bank
		const { url: cashUrl } = await submitApplication(page, {
			name: "Cash Mixed",
			phone: "07700900220",
			paymentPreference: "cash",
		});
		expect(cashUrl).toContain("status=accepted");

		const { url: bankUrl } = await submitApplication(page, {
			name: "Bank Mixed",
			phone: "07700900221",
			paymentPreference: "bank",
			sortCode: "12-34-56",
			accountNumber: "12345678",
		});
		expect(bankUrl).toContain("status=accepted");

		await closeLotteryWindow(page);
		await runLotteryDraw(page, { balance: 500 }); // Plenty of budget for both

		// Both should be selected
		await page.goto("/applications");
		for (const name of ["Cash Mixed", "Bank Mixed"]) {
			const row = page.locator("tr", { hasText: name });
			await expect(row).toContainText("Selected", { timeout: 5000 });
		}

		// Verify grants board has both with correct payment badges
		await page.goto("/grants");
		await expect(page.locator("text=Cash Mixed")).toBeVisible({
			timeout: 10000,
		});
		await expect(page.locator("text=Bank Mixed")).toBeVisible({
			timeout: 10000,
		});

		// Click cash grant — should be awaiting cash handover
		await page.locator("text=Cash Mixed").click();
		await expect(page.locator("#panel")).toContainText(
			"Awaiting Cash Handover",
			{ timeout: 10000 },
		);
		await expect(page.locator("#panel")).toContainText("Cash");

		// Close panel, click bank grant — should be awaiting review
		await page.locator("#panel button", { hasText: "Close" }).click();
		await page.locator("text=Bank Mixed").click();
		await expect(page.locator("#panel")).toContainText(
			"Awaiting Review",
			{ timeout: 10000 },
		);
		await expect(page.locator("#panel")).toContainText("Bank Transfer");
	});
});
