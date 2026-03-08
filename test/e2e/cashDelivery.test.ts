import { solveChallenge } from "altcha-lib";
import { expect, test } from "./fixtures.ts";

/** Fetch challenge from test server, solve it, return base64 payload for the form */
async function solveAltcha(baseURL: string): Promise<string> {
	const res = await fetch(`${baseURL}/api/altcha/challenge`);
	const challenge = await res.json();
	const { promise } = solveChallenge(
		challenge.challenge,
		challenge.salt,
		challenge.algorithm,
		challenge.maxnumber,
	);
	const solution = await promise;
	if (!solution) throw new Error("Failed to solve altcha challenge");
	const payload = {
		algorithm: challenge.algorithm,
		challenge: challenge.challenge,
		number: solution.number,
		salt: challenge.salt,
		signature: challenge.signature,
	};
	return btoa(JSON.stringify(payload));
}

test.describe("cash delivery happy path", () => {
	test("applicant → accepted → selected → cash paid → reimbursed", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await login(page);

		// ── Step 1: Open lottery window ──────────────────────────
		await page.goto("/lottery");
		await expect(page.locator("text=Open Applications")).toBeVisible();
		await page.locator("button", { hasText: "Open Applications" }).click();
		await expect(page.locator("text=Close Applications")).toBeVisible({
			timeout: 10000,
		});

		// ── Step 2: Submit public application (cash) ────────────
		// Solve altcha challenge server-side, then POST form with Playwright request API
		const altchaSolution = await solveAltcha("http://localhost:3001");
		const applyRes = await page.request.post("/apply", {
			multipart: {
				name: "Cash Tester",
				phone: "07700900555",
				meetingPlace: "Town Hall",
				paymentPreference: "cash",
				altcha: altchaSolution,
			},
		});
		// Playwright follows the redirect — verify we landed on the accepted result
		expect(applyRes.ok()).toBe(true);
		expect(applyRes.url()).toContain("status=accepted");

		// Verify application is accepted before the draw
		await page.goto("/applications");
		await expect(page.locator("text=Cash Tester")).toBeVisible({
			timeout: 10000,
		});
		await expect(page.locator("tr", { hasText: "Cash Tester" })).toContainText(
			"Accepted",
			{ timeout: 5000 },
		);

		// ── Step 3: Close window + run draw ──────────────────────
		await page.goto("/lottery");
		await page.locator("button", { hasText: "Close Applications" }).click();
		await expect(page.locator("text=Run Draw")).toBeVisible({
			timeout: 10000,
		});
		const balanceInput = page.locator("input[data-bind-availablebalance]");
		const reserveInput = page.locator("input[data-bind-reserve]");
		const grantInput = page.locator("input[data-bind-grantamount]");
		await balanceInput.click();
		await balanceInput.pressSequentially("500");
		await reserveInput.click();
		await reserveInput.pressSequentially("0");
		await grantInput.click();
		await grantInput.pressSequentially("40");
		await page.locator("button", { hasText: "Run Draw" }).click();
		await page.waitForURL("**/applications**", { timeout: 10000 });

		// Verify application shows on applications page
		await expect(page.locator("text=Cash Tester")).toBeVisible({
			timeout: 10000,
		});

		// Check application status is "Selected"
		const row = page.locator("tr", { hasText: "Cash Tester" });
		await expect(row).toContainText("Selected", { timeout: 5000 });

		// ── Step 4: Navigate to grants board ─────────────────────
		await page.goto("/grants");
		await expect(page.locator("text=Cash Tester")).toBeVisible({
			timeout: 10000,
		});

		// Click the grant card to open the panel
		await page.locator("text=Cash Tester").click();
		await expect(page.locator("#panel")).toContainText(
			"Awaiting Cash Handover",
			{ timeout: 10000 },
		);

		// ── Step 5: Record cash payment ──────────────────────────
		await page.locator("input[data-bind-paymentamount]").fill("40");
		await page.locator("button", { hasText: "Record Payment" }).click();
		await expect(page.locator("#panel")).toContainText(
			"Awaiting Reimbursement",
			{ timeout: 10000 },
		);

		// ── Step 6: Record reimbursement ─────────────────────────
		await page.locator("input[data-bind-expenseref]").fill("OC-12345");
		await page.locator("button", { hasText: "Record Reimbursement" }).click();
		await expect(page.locator("#panel")).toContainText("Reimbursed", {
			timeout: 10000,
		});
		await expect(page.locator("#panel")).toContainText("OC-12345");

		// ── Step 7: Verify grant card shows in the board
		await expect(page.locator("#grants-board")).toContainText("Cash Tester", {
			timeout: 10000,
		});
	});
});
