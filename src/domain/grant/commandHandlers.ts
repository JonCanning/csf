import { CommandHandler } from "@event-driven-io/emmett";
import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import { decide, evolve, initialState } from "./decider.ts";
import type { GrantEvent, GrantState } from "./types.ts";

const handle = CommandHandler<ReturnType<typeof initialState>, GrantEvent>({
	evolve,
	initialState,
});

function streamId(grantId: string): string {
	return `grant-${grantId}`;
}

export async function assignVolunteer(
	grantId: string,
	volunteerId: string,
	eventStore: SQLiteEventStore,
): Promise<void> {
	const now = new Date().toISOString();
	await handle(eventStore, streamId(grantId), (state: GrantState) =>
		decide(
			{
				type: "AssignVolunteer",
				data: { grantId, volunteerId, assignedAt: now },
			},
			state,
		),
	);
}

export async function submitBankDetails(
	grantId: string,
	details: {
		sortCode: string;
		accountNumber: string;
		proofOfAddressRef: string;
	},
	eventStore: SQLiteEventStore,
): Promise<void> {
	const now = new Date().toISOString();
	await handle(eventStore, streamId(grantId), (state: GrantState) =>
		decide(
			{
				type: "SubmitBankDetails",
				data: { grantId, ...details, submittedAt: now },
			},
			state,
		),
	);
}

export async function approveProofOfAddress(
	grantId: string,
	verifiedBy: string,
	eventStore: SQLiteEventStore,
): Promise<void> {
	const now = new Date().toISOString();
	await handle(eventStore, streamId(grantId), (state: GrantState) =>
		decide(
			{
				type: "ApproveProofOfAddress",
				data: { grantId, verifiedBy, verifiedAt: now },
			},
			state,
		),
	);
}

export async function rejectProofOfAddress(
	grantId: string,
	reason: string,
	rejectedBy: string,
	eventStore: SQLiteEventStore,
): Promise<void> {
	const now = new Date().toISOString();
	await handle(eventStore, streamId(grantId), (state: GrantState) =>
		decide(
			{
				type: "RejectProofOfAddress",
				data: { grantId, reason, rejectedBy, rejectedAt: now },
			},
			state,
		),
	);
}

export async function acceptCashAlternative(
	grantId: string,
	eventStore: SQLiteEventStore,
): Promise<void> {
	const now = new Date().toISOString();
	await handle(eventStore, streamId(grantId), (state: GrantState) =>
		decide(
			{
				type: "AcceptCashAlternative",
				data: { grantId, acceptedAt: now },
			},
			state,
		),
	);
}

export async function declineCashAlternative(
	grantId: string,
	eventStore: SQLiteEventStore,
): Promise<void> {
	const now = new Date().toISOString();
	await handle(eventStore, streamId(grantId), (state: GrantState) =>
		decide(
			{
				type: "DeclineCashAlternative",
				data: { grantId, declinedAt: now },
			},
			state,
		),
	);
}

export async function recordPayment(
	grantId: string,
	payment: { amount: number; method: "bank" | "cash"; paidBy: string },
	eventStore: SQLiteEventStore,
): Promise<void> {
	const now = new Date().toISOString();
	await handle(eventStore, streamId(grantId), (state: GrantState) =>
		decide(
			{
				type: "RecordPayment",
				data: { grantId, ...payment, paidAt: now },
			},
			state,
		),
	);
}

export async function recordReimbursement(
	grantId: string,
	reimbursement: { volunteerId: string; expenseReference: string },
	eventStore: SQLiteEventStore,
): Promise<void> {
	const now = new Date().toISOString();
	await handle(eventStore, streamId(grantId), (state: GrantState) =>
		decide(
			{
				type: "RecordReimbursement",
				data: { grantId, ...reimbursement, reimbursedAt: now },
			},
			state,
		),
	);
}

export async function releaseSlot(
	grantId: string,
	reason: string,
	releasedBy: string,
	eventStore: SQLiteEventStore,
): Promise<void> {
	const now = new Date().toISOString();
	await handle(eventStore, streamId(grantId), (state: GrantState) =>
		decide(
			{
				type: "ReleaseSlot",
				data: { grantId, reason, releasedBy, releasedAt: now },
			},
			state,
		),
	);
}
