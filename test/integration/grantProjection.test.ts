import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import type { GrantEvent } from "../../src/domain/grant/types.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";

type GrantRow = {
	id: string;
	application_id: string;
	applicant_id: string;
	month_cycle: string;
	rank: number;
	status: string;
	payment_preference: string;
	volunteer_id: string | null;
	poa_attempts: number;
	amount: number | null;
	payment_method: string | null;
	paid_by: string | null;
	paid_at: string | null;
	expense_reference: string | null;
	reimbursed_at: string | null;
	released_reason: string | null;
	released_at: string | null;
	created_at: string;
	updated_at: string;
};

describe("grantProjection", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;
	});

	afterEach(async () => {
		await pool.close();
	});

	async function queryGrant(id: string): Promise<GrantRow[]> {
		return pool.withConnection(async (conn) =>
			conn.query<GrantRow>("SELECT * FROM grants WHERE id = ?", [id]),
		);
	}

	test("GrantCreated with bank preference creates awaiting_bank_details row", async () => {
		await eventStore.appendToStream<GrantEvent>("grant-g1", [
			{
				type: "GrantCreated",
				data: {
					grantId: "g1",
					applicationId: "app-1",
					applicantId: "applicant-1",
					monthCycle: "2026-03",
					rank: 1,
					paymentPreference: "bank",
					createdAt: "2026-03-01T00:00:00.000Z",
				},
			},
		]);

		const rows = await queryGrant("g1");
		expect(rows).toHaveLength(1);
		expect(rows[0]!.status).toBe("awaiting_bank_details");
		expect(rows[0]!.payment_preference).toBe("bank");
		expect(rows[0]!.poa_attempts).toBe(0);
		expect(rows[0]!.rank).toBe(1);
		expect(rows[0]!.application_id).toBe("app-1");
		expect(rows[0]!.applicant_id).toBe("applicant-1");
	});

	test("GrantCreated with cash preference creates awaiting_cash_handover row", async () => {
		await eventStore.appendToStream<GrantEvent>("grant-g2", [
			{
				type: "GrantCreated",
				data: {
					grantId: "g2",
					applicationId: "app-2",
					applicantId: "applicant-2",
					monthCycle: "2026-03",
					rank: 2,
					paymentPreference: "cash",
					createdAt: "2026-03-01T00:00:00.000Z",
				},
			},
		]);

		const rows = await queryGrant("g2");
		expect(rows).toHaveLength(1);
		expect(rows[0]!.status).toBe("awaiting_cash_handover");
		expect(rows[0]!.payment_preference).toBe("cash");
		expect(rows[0]!.poa_attempts).toBe(0);
	});

	test("Full bank path: submit details, approve POA, paid", async () => {
		const id = "g3";

		await eventStore.appendToStream<GrantEvent>(`grant-${id}`, [
			{
				type: "GrantCreated",
				data: {
					grantId: id,
					applicationId: "app-3",
					applicantId: "applicant-3",
					monthCycle: "2026-03",
					rank: 1,
					paymentPreference: "bank",
					createdAt: "2026-03-01T00:00:00.000Z",
				},
			},
		]);

		let rows = await queryGrant(id);
		expect(rows[0]!.status).toBe("awaiting_bank_details");

		await eventStore.appendToStream<GrantEvent>(`grant-${id}`, [
			{
				type: "BankDetailsSubmitted",
				data: {
					grantId: id,
					sortCode: "12-34-56",
					accountNumber: "12345678",
					proofOfAddressRef: "poa-ref-1",
					submittedAt: "2026-03-02T00:00:00.000Z",
				},
			},
		]);

		rows = await queryGrant(id);
		expect(rows[0]!.status).toBe("bank_details_submitted");
		expect(rows[0]!.poa_attempts).toBe(1);

		await eventStore.appendToStream<GrantEvent>(`grant-${id}`, [
			{
				type: "ProofOfAddressApproved",
				data: {
					grantId: id,
					verifiedBy: "admin-1",
					verifiedAt: "2026-03-03T00:00:00.000Z",
				},
			},
		]);

		rows = await queryGrant(id);
		expect(rows[0]!.status).toBe("poa_approved");

		await eventStore.appendToStream<GrantEvent>(`grant-${id}`, [
			{
				type: "GrantPaid",
				data: {
					grantId: id,
					applicationId: "app-3",
					applicantId: "applicant-3",
					monthCycle: "2026-03",
					amount: 150,
					method: "bank",
					paidBy: "treasurer-1",
					paidAt: "2026-03-04T00:00:00.000Z",
				},
			},
		]);

		rows = await queryGrant(id);
		expect(rows[0]!.status).toBe("paid");
		expect(rows[0]!.amount).toBe(150);
		expect(rows[0]!.payment_method).toBe("bank");
		expect(rows[0]!.paid_at).toBe("2026-03-04T00:00:00.000Z");
	});

	test("cash GrantPaid sets status=awaiting_reimbursement, VolunteerReimbursed sets status=reimbursed", async () => {
		const id = "g-cash-reimburse";

		await eventStore.appendToStream<GrantEvent>(`grant-${id}`, [
			{
				type: "GrantCreated",
				data: {
					grantId: id,
					applicationId: "app-cr",
					applicantId: "applicant-cr",
					monthCycle: "2026-03",
					rank: 1,
					paymentPreference: "cash",
					createdAt: "2026-03-01T00:00:00.000Z",
				},
			},
		]);

		await eventStore.appendToStream<GrantEvent>(`grant-${id}`, [
			{
				type: "GrantPaid",
				data: {
					grantId: id,
					applicationId: "app-cr",
					applicantId: "applicant-cr",
					monthCycle: "2026-03",
					amount: 40,
					method: "cash",
					paidBy: "vol-1",
					paidAt: "2026-03-05T00:00:00.000Z",
				},
			},
		]);

		let rows = await queryGrant(id);
		expect(rows[0]!.status).toBe("awaiting_reimbursement");
		expect(rows[0]!.amount).toBe(40);
		expect(rows[0]!.payment_method).toBe("cash");

		await eventStore.appendToStream<GrantEvent>(`grant-${id}`, [
			{
				type: "VolunteerReimbursed",
				data: {
					grantId: id,
					volunteerId: "vol-1",
					expenseReference: "https://opencollective.com/csf/expenses/123",
					reimbursedAt: "2026-03-06T00:00:00.000Z",
				},
			},
		]);

		rows = await queryGrant(id);
		expect(rows[0]!.status).toBe("reimbursed");
		expect(rows[0]!.expense_reference).toBe(
			"https://opencollective.com/csf/expenses/123",
		);
		expect(rows[0]!.reimbursed_at).toBe("2026-03-06T00:00:00.000Z");
	});

	test("bank GrantPaid sets status=paid (no reimbursement)", async () => {
		const id = "g-bank-paid";

		await eventStore.appendToStream<GrantEvent>(`grant-${id}`, [
			{
				type: "GrantCreated",
				data: {
					grantId: id,
					applicationId: "app-bp",
					applicantId: "applicant-bp",
					monthCycle: "2026-03",
					rank: 1,
					paymentPreference: "bank",
					createdAt: "2026-03-01T00:00:00.000Z",
				},
			},
		]);

		await eventStore.appendToStream<GrantEvent>(`grant-${id}`, [
			{
				type: "GrantPaid",
				data: {
					grantId: id,
					applicationId: "app-bp",
					applicantId: "applicant-bp",
					monthCycle: "2026-03",
					amount: 40,
					method: "bank",
					paidBy: "vol-1",
					paidAt: "2026-03-05T00:00:00.000Z",
				},
			},
		]);

		const rows = await queryGrant(id);
		expect(rows[0]!.status).toBe("paid");
	});

	test("POA rejection cycle, cash alternative offered, declined, slot released", async () => {
		const id = "g4";

		await eventStore.appendToStream<GrantEvent>(`grant-${id}`, [
			{
				type: "GrantCreated",
				data: {
					grantId: id,
					applicationId: "app-4",
					applicantId: "applicant-4",
					monthCycle: "2026-03",
					rank: 3,
					paymentPreference: "bank",
					createdAt: "2026-03-01T00:00:00.000Z",
				},
			},
		]);

		// 3 rounds of submit + reject
		for (let i = 1; i <= 3; i++) {
			await eventStore.appendToStream<GrantEvent>(`grant-${id}`, [
				{
					type: "BankDetailsSubmitted",
					data: {
						grantId: id,
						sortCode: "12-34-56",
						accountNumber: "12345678",
						proofOfAddressRef: `poa-ref-${i}`,
						submittedAt: `2026-03-0${i + 1}T00:00:00.000Z`,
					},
				},
			]);

			await eventStore.appendToStream<GrantEvent>(`grant-${id}`, [
				{
					type: "ProofOfAddressRejected",
					data: {
						grantId: id,
						reason: "blurry",
						attempt: i,
						rejectedBy: "admin-1",
						rejectedAt: `2026-03-0${i + 1}T01:00:00.000Z`,
					},
				},
			]);
		}

		let rows = await queryGrant(id);
		expect(rows[0]!.poa_attempts).toBe(3);
		expect(rows[0]!.status).toBe("awaiting_bank_details");

		await eventStore.appendToStream<GrantEvent>(`grant-${id}`, [
			{
				type: "CashAlternativeOffered",
				data: {
					grantId: id,
					offeredAt: "2026-03-05T00:00:00.000Z",
				},
			},
		]);

		rows = await queryGrant(id);
		expect(rows[0]!.status).toBe("offered_cash_alternative");

		await eventStore.appendToStream<GrantEvent>(`grant-${id}`, [
			{
				type: "CashAlternativeDeclined",
				data: {
					grantId: id,
					declinedAt: "2026-03-06T00:00:00.000Z",
				},
			},
		]);

		// CashAlternativeDeclined is a no-op in projection, status unchanged
		rows = await queryGrant(id);
		expect(rows[0]!.status).toBe("offered_cash_alternative");

		await eventStore.appendToStream<GrantEvent>(`grant-${id}`, [
			{
				type: "SlotReleased",
				data: {
					grantId: id,
					applicationId: "app-4",
					applicantId: "applicant-4",
					monthCycle: "2026-03",
					reason: "declined cash alternative",
					releasedBy: "system",
					releasedAt: "2026-03-06T01:00:00.000Z",
				},
			},
		]);

		rows = await queryGrant(id);
		expect(rows[0]!.status).toBe("released");
		expect(rows[0]!.poa_attempts).toBe(3);
		expect(rows[0]!.released_reason).toBe("declined cash alternative");
		expect(rows[0]!.released_at).toBe("2026-03-06T01:00:00.000Z");
	});
});
