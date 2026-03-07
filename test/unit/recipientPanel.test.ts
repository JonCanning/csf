import { describe, expect, test } from "bun:test";
import type { Recipient } from "../../src/domain/recipient/types";
import {
	createPanel,
	editPanel,
	viewPanel,
} from "../../src/web/pages/recipientPanel";

const alice: Recipient = {
	id: "r-1",
	phone: "07700900001",
	name: "Alice Smith",
	email: "alice@example.com",
	paymentPreference: "bank",
	bankDetails: { sortCode: "12-34-56", accountNumber: "12345678" },
	notes: "Prefers mornings",
	createdAt: "2026-03-01T00:00:00.000Z",
	updatedAt: "2026-03-01T00:00:00.000Z",
};

const bob: Recipient = {
	id: "r-2",
	phone: "07700900002",
	name: "Bob Jones",
	paymentPreference: "cash",
	meetingPlace: "Mill Road",
	createdAt: "2026-03-02T00:00:00.000Z",
	updatedAt: "2026-03-02T00:00:00.000Z",
};

describe("viewPanel", () => {
	test("shows recipient name as heading", () => {
		const html = viewPanel(alice);
		expect(html).toContain("Alice Smith");
	});

	test("shows all fields for bank recipient", () => {
		const html = viewPanel(alice);
		expect(html).toContain("07700900001");
		expect(html).toContain("alice@example.com");
		expect(html).toContain("Bank");
		expect(html).toContain("12-34-56");
		expect(html).toContain("12345678");
		expect(html).toContain("Prefers mornings");
	});

	test("shows meeting place for cash recipient", () => {
		const html = viewPanel(bob);
		expect(html).toContain("Mill Road");
		expect(html).toContain("Cash");
	});

	test("has Edit and Delete buttons", () => {
		const html = viewPanel(alice);
		expect(html).toContain("Edit");
		expect(html).toContain("Delete");
	});

	test("has close button", () => {
		const html = viewPanel(alice);
		expect(html).toContain("Close");
	});

	test("uses signal-driven delete confirmation", () => {
		const html = viewPanel(alice);
		expect(html).toContain("confirmDelete");
		expect(html).toContain("Are you sure?");
		expect(html).toContain("Confirm");
	});
});

describe("editPanel", () => {
	test("renders form with data-bind inputs", () => {
		const html = editPanel(alice);
		expect(html).toContain("data-bind:name");
		expect(html).toContain("data-bind:phone");
		expect(html).toContain("data-bind:email");
	});

	test("pre-fills signal values", () => {
		const html = editPanel(alice);
		expect(html).toContain("Alice Smith");
		expect(html).toContain("07700900001");
		expect(html).toContain("alice@example.com");
	});

	test("has Save and Cancel buttons", () => {
		const html = editPanel(alice);
		expect(html).toContain("Save");
		expect(html).toContain("Cancel");
	});

	test("uses @put for existing recipient", () => {
		const html = editPanel(alice);
		expect(html).toContain("@put");
		expect(html).toContain("/recipients/r-1");
	});
});

describe("createPanel", () => {
	test("renders form with data-bind inputs", () => {
		const html = createPanel();
		expect(html).toContain("data-bind:name");
		expect(html).toContain("data-bind:phone");
	});

	test("initializes signals with empty values", () => {
		const html = createPanel();
		expect(html).toContain("name: ''");
		expect(html).toContain("phone: ''");
	});

	test("has Create and Cancel buttons", () => {
		const html = createPanel();
		expect(html).toContain("Create");
		expect(html).toContain("Cancel");
	});

	test("uses @post for new recipient", () => {
		const html = createPanel();
		expect(html).toContain("@post");
		expect(html).toContain("/recipients");
	});
});
