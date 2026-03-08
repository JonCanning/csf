import type { Page } from "@playwright/test";
import {
	closeLotteryWindow,
	expect,
	openLotteryWindow,
	runLotteryDraw,
	submitApplication,
	test,
} from "./fixtures.ts";

/** Set up a bank grant: apply with bank preference → draw → grant created */
async function setupBankGrant(
	page: Page,
	login: (p: Page) => Promise<void>,
	applicantName: string,
	phone: string,
) {
	await login(page);
	await openLotteryWindow(page);

	const { url } = await submitApplication(page, {
		name: applicantName,
		phone,
		paymentPreference: "bank",
	});
	expect(url).toContain("status=accepted");

	await closeLotteryWindow(page);
	await runLotteryDraw(page, { balance: 500 });

	// Verify selected
	await page.goto("/applications");
	const row = page.locator("tr", { hasText: applicantName });
	await expect(row).toContainText("Selected", { timeout: 5000 });
}

/** Navigate to grant panel for a specific applicant */
async function openGrantPanel(page: Page, applicantName: string) {
	await page.goto("/grants");
	await expect(page.locator(`text=${applicantName}`)).toBeVisible({
		timeout: 10000,
	});
	await page.locator(`text=${applicantName}`).click();
	await expect(page.locator("#panel")).toContainText(applicantName, {
		timeout: 10000,
	});
}

/** Submit bank details via the grant panel form */
async function submitBankDetailsForm(
	page: Page,
	opts?: { sortCode?: string; accountNumber?: string },
) {
	await page
		.locator('input[name="sortCode"]')
		.fill(opts?.sortCode ?? "12-34-56");
	await page
		.locator('input[name="accountNumber"]')
		.fill(opts?.accountNumber ?? "12345678");
	// Create a small test file for POA upload
	const poaInput = page.locator('input[name="poa"]');
	await poaInput.setInputFiles({
		name: "poa.png",
		mimeType: "image/png",
		buffer: Buffer.from("fake-png-data"),
	});
	await page.locator('button[type="submit"]', { hasText: "Submit" }).click();
	// Form POST redirects back to /grants
	await page.waitForURL("**/grants**", { timeout: 10000 });
}

test.describe("bank transfer grant payment path", () => {
	test("full bank happy path: apply → bank details → approve POA → paid", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await setupBankGrant(page, login, "Bank Happy", "07700900100");

		// ── Grant should be in "Awaiting Bank Details" state
		await openGrantPanel(page, "Bank Happy");
		await expect(page.locator("#panel")).toContainText(
			"Awaiting Bank Details",
			{ timeout: 10000 },
		);

		// ── Submit bank details + POA
		await submitBankDetailsForm(page);

		// ── Panel should now show "Bank Details Submitted" with POA review
		await openGrantPanel(page, "Bank Happy");
		await expect(page.locator("#panel")).toContainText(
			"Bank Details Submitted",
			{ timeout: 10000 },
		);
		await expect(page.locator("#panel")).toContainText("View Document");

		// ── Approve POA
		await page.locator("#panel button", { hasText: "Approve POA" }).click();
		await expect(page.locator("#panel")).toContainText("Poa Approved", {
			timeout: 10000,
		});

		// ── Record bank payment
		await page.locator("input[data-bind-paymentamount]").fill("40");
		await page.locator("button", { hasText: "Record Payment" }).click();
		await expect(page.locator("#panel")).toContainText("Paid", {
			timeout: 10000,
		});
		await expect(page.locator("#panel")).toContainText("Bank Transfer");
	});

	test("POA rejection + resubmit → approved → paid", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await setupBankGrant(page, login, "POA Retry", "07700900101");

		// Submit bank details first time
		await openGrantPanel(page, "POA Retry");
		await submitBankDetailsForm(page);

		// Reject POA (attempt 1)
		await openGrantPanel(page, "POA Retry");
		await expect(page.locator("#panel")).toContainText(
			"Bank Details Submitted",
			{
				timeout: 10000,
			},
		);
		await page.locator("#panel button", { hasText: "Reject POA" }).click();

		// Should go back to "Awaiting Bank Details"
		await expect(page.locator("#panel")).toContainText(
			"Awaiting Bank Details",
			{ timeout: 10000 },
		);

		// Resubmit bank details (attempt 2)
		await submitBankDetailsForm(page);

		// Approve POA this time
		await openGrantPanel(page, "POA Retry");
		await expect(page.locator("#panel")).toContainText(
			"Bank Details Submitted",
			{
				timeout: 10000,
			},
		);
		await page.locator("#panel button", { hasText: "Approve POA" }).click();
		await expect(page.locator("#panel")).toContainText("Poa Approved", {
			timeout: 10000,
		});

		// Record bank payment
		await page.locator("input[data-bind-paymentamount]").fill("40");
		await page.locator("button", { hasText: "Record Payment" }).click();
		await expect(page.locator("#panel")).toContainText("Paid", {
			timeout: 10000,
		});
	});

	test("3x POA rejection → cash alternative offered", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await setupBankGrant(page, login, "POA Triple", "07700900102");

		// Submit + reject 3 times
		for (let attempt = 1; attempt <= 3; attempt++) {
			await openGrantPanel(page, "POA Triple");
			await submitBankDetailsForm(page);
			await openGrantPanel(page, "POA Triple");
			await expect(page.locator("#panel")).toContainText(
				"Bank Details Submitted",
				{ timeout: 10000 },
			);
			await page.locator("#panel button", { hasText: "Reject POA" }).click();

			if (attempt < 3) {
				// Should go back to awaiting bank details
				await expect(page.locator("#panel")).toContainText(
					"Awaiting Bank Details",
					{ timeout: 10000 },
				);
			}
		}

		// After 3rd rejection, should offer cash alternative
		await expect(page.locator("#panel")).toContainText(
			"Offered Cash Alternative",
			{ timeout: 10000 },
		);
	});

	test("accept cash alternative → cash handover → paid → reimbursed", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await setupBankGrant(page, login, "Cash Accept", "07700900103");

		// 3x POA rejection to trigger cash alternative
		for (let attempt = 1; attempt <= 3; attempt++) {
			await openGrantPanel(page, "Cash Accept");
			await submitBankDetailsForm(page);
			await openGrantPanel(page, "Cash Accept");
			await expect(page.locator("#panel")).toContainText(
				"Bank Details Submitted",
				{ timeout: 10000 },
			);
			await page.locator("#panel button", { hasText: "Reject POA" }).click();
			if (attempt < 3) {
				await expect(page.locator("#panel")).toContainText(
					"Awaiting Bank Details",
					{ timeout: 10000 },
				);
			}
		}

		await expect(page.locator("#panel")).toContainText(
			"Offered Cash Alternative",
			{ timeout: 10000 },
		);

		// Accept cash alternative
		await page.locator("#panel button", { hasText: "Accept Cash" }).click();
		await expect(page.locator("#panel")).toContainText(
			"Awaiting Cash Handover",
			{ timeout: 10000 },
		);

		// Record cash payment
		await page.locator("input[data-bind-paymentamount]").fill("40");
		await page.locator("button", { hasText: "Record Payment" }).click();
		await expect(page.locator("#panel")).toContainText(
			"Awaiting Reimbursement",
			{ timeout: 10000 },
		);

		// Record reimbursement
		await page.locator("input[data-bind-expenseref]").fill("OC-CASH-ALT");
		await page.locator("button", { hasText: "Record Reimbursement" }).click();
		await expect(page.locator("#panel")).toContainText("Reimbursed", {
			timeout: 10000,
		});
		await expect(page.locator("#panel")).toContainText("OC-CASH-ALT");
	});

	test("decline cash alternative → slot released", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await setupBankGrant(page, login, "Cash Decline", "07700900104");

		// 3x POA rejection to trigger cash alternative
		for (let attempt = 1; attempt <= 3; attempt++) {
			await openGrantPanel(page, "Cash Decline");
			await submitBankDetailsForm(page);
			await openGrantPanel(page, "Cash Decline");
			await expect(page.locator("#panel")).toContainText(
				"Bank Details Submitted",
				{ timeout: 10000 },
			);
			await page.locator("#panel button", { hasText: "Reject POA" }).click();
			if (attempt < 3) {
				await expect(page.locator("#panel")).toContainText(
					"Awaiting Bank Details",
					{ timeout: 10000 },
				);
			}
		}

		await expect(page.locator("#panel")).toContainText(
			"Offered Cash Alternative",
			{ timeout: 10000 },
		);

		// Decline cash alternative
		await page.locator("#panel button", { hasText: "Decline Cash" }).click();
		await expect(page.locator("#panel")).toContainText("Released", {
			timeout: 10000,
		});
		await expect(page.locator("#panel")).toContainText(
			"Cash alternative declined",
		);
	});
});
