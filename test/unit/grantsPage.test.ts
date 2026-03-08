import { describe, expect, test } from "bun:test";
import type { GrantRow } from "../../src/domain/grant/repository.ts";
import { grantPanel } from "../../src/web/pages/grantPanel.ts";
import { grantsBoard, grantsPage } from "../../src/web/pages/grants.ts";

function makeGrant(overrides: Partial<GrantRow> = {}): GrantRow {
	return {
		id: "g1",
		applicationId: "app-1",
		applicantId: "a1",
		monthCycle: "2026-03",
		rank: 1,
		status: "awaiting_bank_details",
		paymentPreference: "bank",
		volunteerId: null,
		volunteerName: null,
		applicantName: "Alice Smith",
		applicantPhone: "07700900001",
		poaAttempts: 0,
		amount: null,
		paymentMethod: null,
		paidBy: null,
		paidAt: null,
		expenseReference: null,
		reimbursedAt: null,
		releasedReason: null,
		releasedAt: null,
		createdAt: "2026-03-01",
		updatedAt: "2026-03-01",
		...overrides,
	};
}

describe("grantsPage", () => {
	test("renders page with month selector", () => {
		const html = grantsPage([], ["2026-03", "2026-02"], "2026-03");
		expect(html).toContain("Grants");
		expect(html).toContain("2026-03");
		expect(html).toContain("2026-02");
	});

	test("renders kanban columns", () => {
		const html = grantsPage([], ["2026-03"], "2026-03");
		expect(html).toContain("Awaiting Review");
		expect(html).toContain("Awaiting Payment");
		expect(html).toContain("Paid");
		expect(html).toContain("Complete");
	});

	test("renders grant cards in correct columns", () => {
		const grants = [
			makeGrant({ id: "g1", status: "awaiting_bank_details" }),
			makeGrant({ id: "g2", status: "paid", applicantName: "Bob" }),
		];
		const html = grantsBoard(grants);
		expect(html).toContain("Alice Smith");
		expect(html).toContain("Bob");
	});

	test("shows payment preference badge on cards", () => {
		const grants = [
			makeGrant({ paymentPreference: "bank" }),
			makeGrant({ id: "g2", paymentPreference: "cash" }),
		];
		const html = grantsBoard(grants);
		expect(html).toContain("Bank");
		expect(html).toContain("Cash");
	});

	test("shows volunteer name on card when assigned", () => {
		const grants = [makeGrant({ volunteerName: "Bob Volunteer" })];
		const html = grantsBoard(grants);
		expect(html).toContain("Bob Volunteer");
	});

	test("shows 'Unassigned' when no volunteer", () => {
		const grants = [makeGrant({ volunteerId: null, volunteerName: null })];
		const html = grantsBoard(grants);
		expect(html).toContain("Unassigned");
	});
});

describe("grantPanel", () => {
	const volunteers = [
		{
			id: "v1",
			name: "Bob Volunteer",
			isAdmin: false,
			isDisabled: false,
			requiresPasswordReset: false,
			createdAt: "2026-01-01",
			updatedAt: "2026-01-01",
		},
	];

	test("awaiting_bank_details shows bank details form", () => {
		const grant = makeGrant({ status: "awaiting_bank_details" });
		const html = grantPanel(grant, volunteers, false);
		expect(html).toContain("Submit Bank Details");
		expect(html).toContain("Sort Code");
		expect(html).toContain("Account Number");
		expect(html).toContain("Proof of Address");
	});

	test("awaiting_bank_details shows assign volunteer form", () => {
		const grant = makeGrant({ status: "awaiting_bank_details" });
		const html = grantPanel(grant, volunteers, false);
		expect(html).toContain("Assign Volunteer");
		expect(html).toContain("Bob Volunteer");
	});

	test("awaiting_bank_details shows release slot form", () => {
		const grant = makeGrant({ status: "awaiting_bank_details" });
		const html = grantPanel(grant, volunteers, false);
		expect(html).toContain("Release Slot");
	});

	test("bank_details_submitted shows POA review actions", () => {
		const grant = makeGrant({
			status: "bank_details_submitted",
			poaAttempts: 1,
		});
		const html = grantPanel(grant, volunteers, true);
		expect(html).toContain("Approve POA");
		expect(html).toContain("Reject POA");
		expect(html).toContain("View Document");
		expect(html).toContain("POA attempts: 1");
	});

	test("poa_approved shows record payment form with bank method", () => {
		const grant = makeGrant({ status: "poa_approved" });
		const html = grantPanel(grant, volunteers, false);
		expect(html).toContain("Record Payment");
		expect(html).toContain("method=bank");
	});

	test("awaiting_cash_handover shows record payment form with cash method", () => {
		const grant = makeGrant({
			status: "awaiting_cash_handover",
			paymentPreference: "cash",
		});
		const html = grantPanel(grant, volunteers, false);
		expect(html).toContain("Record Payment");
		expect(html).toContain("method=cash");
	});

	test("offered_cash_alternative shows accept/decline buttons", () => {
		const grant = makeGrant({ status: "offered_cash_alternative" });
		const html = grantPanel(grant, volunteers, false);
		expect(html).toContain("Accept Cash");
		expect(html).toContain("Decline Cash");
	});

	test("paid status shows payment details", () => {
		const grant = makeGrant({
			status: "paid",
			amount: 150,
			paymentMethod: "bank",
			paidAt: "2026-03-04T00:00:00.000Z",
		});
		const html = grantPanel(grant, volunteers, false);
		expect(html).toContain("£150.00");
		expect(html).toContain("Bank Transfer");
	});

	test("awaiting_reimbursement shows reimbursement form", () => {
		const grant = makeGrant({
			status: "awaiting_reimbursement",
			amount: 40,
			paymentMethod: "cash",
			paidBy: "v1",
			paidAt: "2026-03-05",
		});
		const html = grantPanel(grant, volunteers, false);
		expect(html).toContain("Record Reimbursement");
		expect(html).toContain("Expense Reference");
	});

	test("released shows reason and date", () => {
		const grant = makeGrant({
			status: "released",
			releasedReason: "No contact",
			releasedAt: "2026-03-06T00:00:00.000Z",
		});
		const html = grantPanel(grant, volunteers, false);
		expect(html).toContain("No contact");
	});

	test("panel has close button", () => {
		const grant = makeGrant();
		const html = grantPanel(grant, volunteers, false);
		expect(html).toContain("/grants/close");
	});
});
