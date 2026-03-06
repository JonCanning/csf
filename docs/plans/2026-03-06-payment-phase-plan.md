# Payment Phase Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the Grant aggregate that handles the full payment lifecycle after lottery selection — bank details + POA verification, cash handover, cash alternative fallback, slot release, and grant recording.

**Architecture:** New Grant aggregate (decider pattern) with its own event stream (`grant-{id}`). A process manager reacts to `ApplicationSelected` events to create grants. The existing `src/domain/grant/types.ts` will be replaced entirely — it has stale types from a previous iteration.

**Tech Stack:** TypeScript, emmett (event sourcing), bun:test, bun:sqlite

---

### Task 1: Grant Types

**Files:**
- Replace: `src/domain/grant/types.ts`

**Step 1: Write the types file**

Replace `src/domain/grant/types.ts` entirely with:

```typescript
import type { Command, Event } from "@event-driven-io/emmett";
import type { PaymentPreference } from "../application/types.ts";

// Commands

export type CreateGrant = Command<
	"CreateGrant",
	{
		grantId: string;
		applicationId: string;
		applicantId: string;
		monthCycle: string;
		rank: number;
		paymentPreference: PaymentPreference;
		createdAt: string;
	}
>;

export type AssignVolunteer = Command<
	"AssignVolunteer",
	{
		grantId: string;
		volunteerId: string;
		assignedAt: string;
	}
>;

export type SubmitBankDetails = Command<
	"SubmitBankDetails",
	{
		grantId: string;
		sortCode: string;
		accountNumber: string;
		proofOfAddressRef: string;
		submittedAt: string;
	}
>;

export type ApproveProofOfAddress = Command<
	"ApproveProofOfAddress",
	{
		grantId: string;
		verifiedBy: string;
		verifiedAt: string;
	}
>;

export type RejectProofOfAddress = Command<
	"RejectProofOfAddress",
	{
		grantId: string;
		reason: string;
		rejectedBy: string;
		rejectedAt: string;
	}
>;

export type AcceptCashAlternative = Command<
	"AcceptCashAlternative",
	{
		grantId: string;
		acceptedAt: string;
	}
>;

export type DeclineCashAlternative = Command<
	"DeclineCashAlternative",
	{
		grantId: string;
		declinedAt: string;
	}
>;

export type RecordPayment = Command<
	"RecordPayment",
	{
		grantId: string;
		amount: number;
		method: "bank" | "cash";
		paidBy: string;
		paidAt: string;
	}
>;

export type ReleaseSlot = Command<
	"ReleaseSlot",
	{
		grantId: string;
		reason: string;
		releasedBy: string;
		releasedAt: string;
	}
>;

export type GrantCommand =
	| CreateGrant
	| AssignVolunteer
	| SubmitBankDetails
	| ApproveProofOfAddress
	| RejectProofOfAddress
	| AcceptCashAlternative
	| DeclineCashAlternative
	| RecordPayment
	| ReleaseSlot;

// Events

export type GrantCreated = Event<
	"GrantCreated",
	{
		grantId: string;
		applicationId: string;
		applicantId: string;
		monthCycle: string;
		rank: number;
		paymentPreference: PaymentPreference;
		createdAt: string;
	}
>;

export type VolunteerAssigned = Event<
	"VolunteerAssigned",
	{
		grantId: string;
		volunteerId: string;
		assignedAt: string;
	}
>;

export type BankDetailsSubmitted = Event<
	"BankDetailsSubmitted",
	{
		grantId: string;
		sortCode: string;
		accountNumber: string;
		proofOfAddressRef: string;
		submittedAt: string;
	}
>;

export type ProofOfAddressApproved = Event<
	"ProofOfAddressApproved",
	{
		grantId: string;
		verifiedBy: string;
		verifiedAt: string;
	}
>;

export type ProofOfAddressRejected = Event<
	"ProofOfAddressRejected",
	{
		grantId: string;
		reason: string;
		attempt: number;
		rejectedBy: string;
		rejectedAt: string;
	}
>;

export type CashAlternativeOffered = Event<
	"CashAlternativeOffered",
	{
		grantId: string;
		offeredAt: string;
	}
>;

export type CashAlternativeAccepted = Event<
	"CashAlternativeAccepted",
	{
		grantId: string;
		acceptedAt: string;
	}
>;

export type CashAlternativeDeclined = Event<
	"CashAlternativeDeclined",
	{
		grantId: string;
		declinedAt: string;
	}
>;

export type GrantPaid = Event<
	"GrantPaid",
	{
		grantId: string;
		applicationId: string;
		applicantId: string;
		monthCycle: string;
		amount: number;
		method: "bank" | "cash";
		paidBy: string;
		paidAt: string;
	}
>;

export type SlotReleased = Event<
	"SlotReleased",
	{
		grantId: string;
		applicationId: string;
		applicantId: string;
		monthCycle: string;
		reason: string;
		releasedBy: string;
		releasedAt: string;
	}
>;

export type GrantEvent =
	| GrantCreated
	| VolunteerAssigned
	| BankDetailsSubmitted
	| ProofOfAddressApproved
	| ProofOfAddressRejected
	| CashAlternativeOffered
	| CashAlternativeAccepted
	| CashAlternativeDeclined
	| GrantPaid
	| SlotReleased;

export type GrantEventType = GrantEvent["type"];

// State

type GrantCore = {
	grantId: string;
	applicationId: string;
	applicantId: string;
	monthCycle: string;
	rank: number;
	volunteerId?: string;
};

export type GrantState =
	| { status: "initial" }
	| GrantCore & {
			status: "awaiting_bank_details";
			poaAttempts: number;
	  }
	| GrantCore & {
			status: "bank_details_submitted";
			poaAttempts: number;
			sortCode: string;
			accountNumber: string;
			proofOfAddressRef: string;
	  }
	| GrantCore & {
			status: "poa_approved";
			poaAttempts: number;
	  }
	| GrantCore & {
			status: "offered_cash_alternative";
	  }
	| GrantCore & {
			status: "awaiting_cash_handover";
	  }
	| GrantCore & {
			status: "paid";
			amount: number;
			method: "bank" | "cash";
			paidAt: string;
	  }
	| GrantCore & {
			status: "released";
			reason: string;
			releasedAt: string;
	  };
```

**Step 2: Verify it compiles**

Run: `bunx tsc --noEmit src/domain/grant/types.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/domain/grant/types.ts
git commit -m "Replace grant types with full payment phase state machine"
```

---

### Task 2: Grant Decider — Unit Tests (Happy Paths)

**Files:**
- Create: `test/unit/grantDecider.test.ts`

**Step 1: Write failing tests for all happy-path transitions**

```typescript
import { describe, expect, test } from "bun:test";
import { IllegalStateError } from "@event-driven-io/emmett";
import { decide, evolve, initialState } from "../../src/domain/grant/decider.ts";
import type { GrantState } from "../../src/domain/grant/types.ts";

// State factories

function awaitingBankDetails(overrides?: Partial<GrantState>): GrantState {
	return {
		status: "awaiting_bank_details",
		grantId: "grant-1",
		applicationId: "app-1",
		applicantId: "applicant-1",
		monthCycle: "2026-03",
		rank: 1,
		poaAttempts: 0,
		...overrides,
	};
}

function bankDetailsSubmitted(
	poaAttempts = 1,
	overrides?: Partial<GrantState>,
): GrantState {
	return {
		status: "bank_details_submitted",
		grantId: "grant-1",
		applicationId: "app-1",
		applicantId: "applicant-1",
		monthCycle: "2026-03",
		rank: 1,
		poaAttempts,
		sortCode: "12-34-56",
		accountNumber: "12345678",
		proofOfAddressRef: "poa-ref-1",
		...overrides,
	};
}

function poaApproved(overrides?: Partial<GrantState>): GrantState {
	return {
		status: "poa_approved",
		grantId: "grant-1",
		applicationId: "app-1",
		applicantId: "applicant-1",
		monthCycle: "2026-03",
		rank: 1,
		poaAttempts: 1,
		...overrides,
	};
}

function offeredCashAlt(overrides?: Partial<GrantState>): GrantState {
	return {
		status: "offered_cash_alternative",
		grantId: "grant-1",
		applicationId: "app-1",
		applicantId: "applicant-1",
		monthCycle: "2026-03",
		rank: 1,
		...overrides,
	};
}

function awaitingCashHandover(overrides?: Partial<GrantState>): GrantState {
	return {
		status: "awaiting_cash_handover",
		grantId: "grant-1",
		applicationId: "app-1",
		applicantId: "applicant-1",
		monthCycle: "2026-03",
		rank: 1,
		...overrides,
	};
}

describe("grant decider", () => {
	// --- CreateGrant ---

	test("initial → CreateGrant(bank) → GrantCreated + awaiting_bank_details", () => {
		const events = decide(
			{
				type: "CreateGrant",
				data: {
					grantId: "grant-1",
					applicationId: "app-1",
					applicantId: "applicant-1",
					monthCycle: "2026-03",
					rank: 1,
					paymentPreference: "bank",
					createdAt: "2026-04-01T10:00:00Z",
				},
			},
			initialState(),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("GrantCreated");
		expect(events[0]!.data.paymentPreference).toBe("bank");
	});

	test("initial → CreateGrant(cash) → GrantCreated + awaiting_cash_handover", () => {
		const events = decide(
			{
				type: "CreateGrant",
				data: {
					grantId: "grant-1",
					applicationId: "app-1",
					applicantId: "applicant-1",
					monthCycle: "2026-03",
					rank: 1,
					paymentPreference: "cash",
					createdAt: "2026-04-01T10:00:00Z",
				},
			},
			initialState(),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("GrantCreated");
		expect(events[0]!.data.paymentPreference).toBe("cash");
	});

	test("CreateGrant on non-initial state throws", () => {
		expect(() =>
			decide(
				{
					type: "CreateGrant",
					data: {
						grantId: "grant-1",
						applicationId: "app-1",
						applicantId: "applicant-1",
						monthCycle: "2026-03",
						rank: 1,
						paymentPreference: "bank",
						createdAt: "2026-04-01T10:00:00Z",
					},
				},
				awaitingBankDetails(),
			),
		).toThrow(IllegalStateError);
	});

	// --- SubmitBankDetails ---

	test("awaiting_bank_details → SubmitBankDetails → BankDetailsSubmitted", () => {
		const events = decide(
			{
				type: "SubmitBankDetails",
				data: {
					grantId: "grant-1",
					sortCode: "12-34-56",
					accountNumber: "12345678",
					proofOfAddressRef: "poa-ref-1",
					submittedAt: "2026-04-02T10:00:00Z",
				},
			},
			awaitingBankDetails(),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("BankDetailsSubmitted");
	});

	// --- ApproveProofOfAddress ---

	test("bank_details_submitted → ApproveProofOfAddress → ProofOfAddressApproved", () => {
		const events = decide(
			{
				type: "ApproveProofOfAddress",
				data: {
					grantId: "grant-1",
					verifiedBy: "vol-1",
					verifiedAt: "2026-04-03T10:00:00Z",
				},
			},
			bankDetailsSubmitted(1),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("ProofOfAddressApproved");
	});

	// --- RejectProofOfAddress (attempts 1 & 2 → back to awaiting) ---

	test("bank_details_submitted (attempt 1) → RejectProofOfAddress → rejected + back to awaiting", () => {
		const events = decide(
			{
				type: "RejectProofOfAddress",
				data: {
					grantId: "grant-1",
					reason: "Blurry document",
					rejectedBy: "vol-1",
					rejectedAt: "2026-04-03T10:00:00Z",
				},
			},
			bankDetailsSubmitted(1),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("ProofOfAddressRejected");
		expect(events[0]!.data.attempt).toBe(1);

		// Evolving should return to awaiting_bank_details
		const state = evolve(bankDetailsSubmitted(1), events[0]!);
		expect(state.status).toBe("awaiting_bank_details");
	});

	// --- RejectProofOfAddress (attempt 3 → offer cash alternative) ---

	test("bank_details_submitted (attempt 3) → RejectProofOfAddress → rejected + CashAlternativeOffered", () => {
		const events = decide(
			{
				type: "RejectProofOfAddress",
				data: {
					grantId: "grant-1",
					reason: "Wrong address",
					rejectedBy: "vol-1",
					rejectedAt: "2026-04-03T10:00:00Z",
				},
			},
			bankDetailsSubmitted(3),
		);
		expect(events).toHaveLength(2);
		expect(events[0]!.type).toBe("ProofOfAddressRejected");
		expect(events[0]!.data.attempt).toBe(3);
		expect(events[1]!.type).toBe("CashAlternativeOffered");
	});

	// --- AcceptCashAlternative ---

	test("offered_cash_alternative → AcceptCashAlternative → CashAlternativeAccepted", () => {
		const events = decide(
			{
				type: "AcceptCashAlternative",
				data: { grantId: "grant-1", acceptedAt: "2026-04-04T10:00:00Z" },
			},
			offeredCashAlt(),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("CashAlternativeAccepted");
	});

	// --- DeclineCashAlternative ---

	test("offered_cash_alternative → DeclineCashAlternative → SlotReleased", () => {
		const events = decide(
			{
				type: "DeclineCashAlternative",
				data: { grantId: "grant-1", declinedAt: "2026-04-04T10:00:00Z" },
			},
			offeredCashAlt(),
		);
		expect(events).toHaveLength(2);
		expect(events[0]!.type).toBe("CashAlternativeDeclined");
		expect(events[1]!.type).toBe("SlotReleased");
	});

	// --- RecordPayment (bank path) ---

	test("poa_approved → RecordPayment → GrantPaid", () => {
		const events = decide(
			{
				type: "RecordPayment",
				data: {
					grantId: "grant-1",
					amount: 40,
					method: "bank",
					paidBy: "vol-1",
					paidAt: "2026-04-05T10:00:00Z",
				},
			},
			poaApproved(),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("GrantPaid");
		expect(events[0]!.data.amount).toBe(40);
		expect(events[0]!.data.method).toBe("bank");
	});

	// --- RecordPayment (cash path) ---

	test("awaiting_cash_handover → RecordPayment → GrantPaid", () => {
		const events = decide(
			{
				type: "RecordPayment",
				data: {
					grantId: "grant-1",
					amount: 40,
					method: "cash",
					paidBy: "vol-1",
					paidAt: "2026-04-05T10:00:00Z",
				},
			},
			awaitingCashHandover(),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("GrantPaid");
		expect(events[0]!.data.method).toBe("cash");
	});

	// --- ReleaseSlot ---

	test("awaiting_bank_details → ReleaseSlot → SlotReleased", () => {
		const events = decide(
			{
				type: "ReleaseSlot",
				data: {
					grantId: "grant-1",
					reason: "Unresponsive",
					releasedBy: "vol-1",
					releasedAt: "2026-04-15T10:00:00Z",
				},
			},
			awaitingBankDetails(),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("SlotReleased");
	});

	test("awaiting_cash_handover → ReleaseSlot → SlotReleased", () => {
		const events = decide(
			{
				type: "ReleaseSlot",
				data: {
					grantId: "grant-1",
					reason: "No-show",
					releasedBy: "vol-1",
					releasedAt: "2026-04-15T10:00:00Z",
				},
			},
			awaitingCashHandover(),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("SlotReleased");
	});

	test("cannot release already-paid grant", () => {
		const paid: GrantState = {
			status: "paid",
			grantId: "grant-1",
			applicationId: "app-1",
			applicantId: "applicant-1",
			monthCycle: "2026-03",
			rank: 1,
			amount: 40,
			method: "bank",
			paidAt: "2026-04-05T10:00:00Z",
		};
		expect(() =>
			decide(
				{
					type: "ReleaseSlot",
					data: {
						grantId: "grant-1",
						reason: "test",
						releasedBy: "vol-1",
						releasedAt: "2026-04-15T10:00:00Z",
					},
				},
				paid,
			),
		).toThrow(IllegalStateError);
	});

	// --- AssignVolunteer ---

	test("AssignVolunteer works on any non-terminal state", () => {
		const events = decide(
			{
				type: "AssignVolunteer",
				data: {
					grantId: "grant-1",
					volunteerId: "vol-1",
					assignedAt: "2026-04-01T12:00:00Z",
				},
			},
			awaitingBankDetails(),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("VolunteerAssigned");
	});

	// --- Evolve ---

	test("evolve: GrantCreated(bank) → awaiting_bank_details", () => {
		const state = evolve(initialState(), {
			type: "GrantCreated",
			data: {
				grantId: "grant-1",
				applicationId: "app-1",
				applicantId: "applicant-1",
				monthCycle: "2026-03",
				rank: 1,
				paymentPreference: "bank",
				createdAt: "2026-04-01T10:00:00Z",
			},
		});
		expect(state.status).toBe("awaiting_bank_details");
		if (state.status === "awaiting_bank_details") {
			expect(state.poaAttempts).toBe(0);
		}
	});

	test("evolve: GrantCreated(cash) → awaiting_cash_handover", () => {
		const state = evolve(initialState(), {
			type: "GrantCreated",
			data: {
				grantId: "grant-1",
				applicationId: "app-1",
				applicantId: "applicant-1",
				monthCycle: "2026-03",
				rank: 1,
				paymentPreference: "cash",
				createdAt: "2026-04-01T10:00:00Z",
			},
		});
		expect(state.status).toBe("awaiting_cash_handover");
	});

	test("evolve: ProofOfAddressRejected (attempt < 3) → awaiting_bank_details", () => {
		const state = evolve(bankDetailsSubmitted(1), {
			type: "ProofOfAddressRejected",
			data: {
				grantId: "grant-1",
				reason: "Blurry",
				attempt: 1,
				rejectedBy: "vol-1",
				rejectedAt: "2026-04-03T10:00:00Z",
			},
		});
		expect(state.status).toBe("awaiting_bank_details");
	});

	test("evolve: CashAlternativeOffered → offered_cash_alternative", () => {
		// After 3rd rejection, CashAlternativeOffered is emitted
		// But evolve processes events one at a time, so first evolve the rejection:
		const afterRejection = evolve(bankDetailsSubmitted(3), {
			type: "ProofOfAddressRejected",
			data: {
				grantId: "grant-1",
				reason: "Wrong",
				attempt: 3,
				rejectedBy: "vol-1",
				rejectedAt: "2026-04-03T10:00:00Z",
			},
		});
		const state = evolve(afterRejection, {
			type: "CashAlternativeOffered",
			data: { grantId: "grant-1", offeredAt: "2026-04-03T10:00:00Z" },
		});
		expect(state.status).toBe("offered_cash_alternative");
	});

	test("evolve: GrantPaid → paid", () => {
		const state = evolve(awaitingCashHandover(), {
			type: "GrantPaid",
			data: {
				grantId: "grant-1",
				applicationId: "app-1",
				applicantId: "applicant-1",
				monthCycle: "2026-03",
				amount: 40,
				method: "cash",
				paidBy: "vol-1",
				paidAt: "2026-04-05T10:00:00Z",
			},
		});
		expect(state.status).toBe("paid");
	});

	test("evolve: SlotReleased → released", () => {
		const state = evolve(awaitingBankDetails(), {
			type: "SlotReleased",
			data: {
				grantId: "grant-1",
				applicationId: "app-1",
				applicantId: "applicant-1",
				monthCycle: "2026-03",
				reason: "Unresponsive",
				releasedBy: "vol-1",
				releasedAt: "2026-04-15T10:00:00Z",
			},
		});
		expect(state.status).toBe("released");
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test test/unit/grantDecider.test.ts`
Expected: FAIL — `decider.ts` doesn't exist yet

**Step 3: Commit test file**

```bash
git add test/unit/grantDecider.test.ts
git commit -m "Add grant decider unit tests (red)"
```

---

### Task 3: Grant Decider — Implementation

**Files:**
- Create: `src/domain/grant/decider.ts`

**Step 1: Implement the decider**

```typescript
import { IllegalStateError } from "@event-driven-io/emmett";
import type {
	GrantCommand,
	GrantEvent,
	GrantState,
} from "./types.ts";

export const initialState = (): GrantState => ({ status: "initial" });

export function decide(
	command: GrantCommand,
	state: GrantState,
): GrantEvent[] {
	switch (command.type) {
		case "CreateGrant":
			return decideCreate(command, state);
		case "AssignVolunteer":
			return decideAssignVolunteer(command, state);
		case "SubmitBankDetails":
			return decideSubmitBankDetails(command, state);
		case "ApproveProofOfAddress":
			return decideApprovePoa(command, state);
		case "RejectProofOfAddress":
			return decideRejectPoa(command, state);
		case "AcceptCashAlternative":
			return decideAcceptCash(command, state);
		case "DeclineCashAlternative":
			return decideDeclineCash(command, state);
		case "RecordPayment":
			return decideRecordPayment(command, state);
		case "ReleaseSlot":
			return decideReleaseSlot(command, state);
	}
}

function decideCreate(
	command: Extract<GrantCommand, { type: "CreateGrant" }>,
	state: GrantState,
): GrantEvent[] {
	if (state.status !== "initial") {
		throw new IllegalStateError(
			`Grant already created (status: ${state.status})`,
		);
	}
	return [
		{
			type: "GrantCreated",
			data: { ...command.data },
		},
	];
}

function assertNonTerminal(state: GrantState): asserts state is Exclude<
	GrantState,
	{ status: "initial" | "paid" | "released" }
> {
	if (
		state.status === "initial" ||
		state.status === "paid" ||
		state.status === "released"
	) {
		throw new IllegalStateError(
			`Cannot perform action in ${state.status} state`,
		);
	}
}

function decideAssignVolunteer(
	command: Extract<GrantCommand, { type: "AssignVolunteer" }>,
	state: GrantState,
): GrantEvent[] {
	assertNonTerminal(state);
	return [
		{
			type: "VolunteerAssigned",
			data: {
				grantId: command.data.grantId,
				volunteerId: command.data.volunteerId,
				assignedAt: command.data.assignedAt,
			},
		},
	];
}

function decideSubmitBankDetails(
	command: Extract<GrantCommand, { type: "SubmitBankDetails" }>,
	state: GrantState,
): GrantEvent[] {
	if (state.status !== "awaiting_bank_details") {
		throw new IllegalStateError(
			`Cannot submit bank details in ${state.status} state`,
		);
	}
	return [
		{
			type: "BankDetailsSubmitted",
			data: {
				grantId: command.data.grantId,
				sortCode: command.data.sortCode,
				accountNumber: command.data.accountNumber,
				proofOfAddressRef: command.data.proofOfAddressRef,
				submittedAt: command.data.submittedAt,
			},
		},
	];
}

function decideApprovePoa(
	command: Extract<GrantCommand, { type: "ApproveProofOfAddress" }>,
	state: GrantState,
): GrantEvent[] {
	if (state.status !== "bank_details_submitted") {
		throw new IllegalStateError(
			`Cannot approve POA in ${state.status} state`,
		);
	}
	return [
		{
			type: "ProofOfAddressApproved",
			data: {
				grantId: command.data.grantId,
				verifiedBy: command.data.verifiedBy,
				verifiedAt: command.data.verifiedAt,
			},
		},
	];
}

function decideRejectPoa(
	command: Extract<GrantCommand, { type: "RejectProofOfAddress" }>,
	state: GrantState,
): GrantEvent[] {
	if (state.status !== "bank_details_submitted") {
		throw new IllegalStateError(
			`Cannot reject POA in ${state.status} state`,
		);
	}

	const attempt = state.poaAttempts;
	const events: GrantEvent[] = [
		{
			type: "ProofOfAddressRejected",
			data: {
				grantId: command.data.grantId,
				reason: command.data.reason,
				attempt,
				rejectedBy: command.data.rejectedBy,
				rejectedAt: command.data.rejectedAt,
			},
		},
	];

	if (attempt >= 3) {
		events.push({
			type: "CashAlternativeOffered",
			data: {
				grantId: command.data.grantId,
				offeredAt: command.data.rejectedAt,
			},
		});
	}

	return events;
}

function decideAcceptCash(
	command: Extract<GrantCommand, { type: "AcceptCashAlternative" }>,
	state: GrantState,
): GrantEvent[] {
	if (state.status !== "offered_cash_alternative") {
		throw new IllegalStateError(
			`Cannot accept cash alternative in ${state.status} state`,
		);
	}
	return [
		{
			type: "CashAlternativeAccepted",
			data: {
				grantId: command.data.grantId,
				acceptedAt: command.data.acceptedAt,
			},
		},
	];
}

function decideDeclineCash(
	command: Extract<GrantCommand, { type: "DeclineCashAlternative" }>,
	state: GrantState,
): GrantEvent[] {
	if (state.status !== "offered_cash_alternative") {
		throw new IllegalStateError(
			`Cannot decline cash alternative in ${state.status} state`,
		);
	}
	return [
		{
			type: "CashAlternativeDeclined",
			data: {
				grantId: command.data.grantId,
				declinedAt: command.data.declinedAt,
			},
		},
		{
			type: "SlotReleased",
			data: {
				grantId: state.grantId,
				applicationId: state.applicationId,
				applicantId: state.applicantId,
				monthCycle: state.monthCycle,
				reason: "Declined cash alternative",
				releasedBy: "system",
				releasedAt: command.data.declinedAt,
			},
		},
	];
}

function decideRecordPayment(
	command: Extract<GrantCommand, { type: "RecordPayment" }>,
	state: GrantState,
): GrantEvent[] {
	if (
		state.status !== "poa_approved" &&
		state.status !== "awaiting_cash_handover"
	) {
		throw new IllegalStateError(
			`Cannot record payment in ${state.status} state`,
		);
	}
	return [
		{
			type: "GrantPaid",
			data: {
				grantId: state.grantId,
				applicationId: state.applicationId,
				applicantId: state.applicantId,
				monthCycle: state.monthCycle,
				amount: command.data.amount,
				method: command.data.method,
				paidBy: command.data.paidBy,
				paidAt: command.data.paidAt,
			},
		},
	];
}

function decideReleaseSlot(
	command: Extract<GrantCommand, { type: "ReleaseSlot" }>,
	state: GrantState,
): GrantEvent[] {
	assertNonTerminal(state);
	return [
		{
			type: "SlotReleased",
			data: {
				grantId: state.grantId,
				applicationId: state.applicationId,
				applicantId: state.applicantId,
				monthCycle: state.monthCycle,
				reason: command.data.reason,
				releasedBy: command.data.releasedBy,
				releasedAt: command.data.releasedAt,
			},
		},
	];
}

function coreFrom(state: Exclude<GrantState, { status: "initial" }>) {
	return {
		grantId: state.grantId,
		applicationId: state.applicationId,
		applicantId: state.applicantId,
		monthCycle: state.monthCycle,
		rank: state.rank,
		volunteerId: state.volunteerId,
	};
}

export function evolve(state: GrantState, event: GrantEvent): GrantState {
	switch (event.type) {
		case "GrantCreated": {
			const core = {
				grantId: event.data.grantId,
				applicationId: event.data.applicationId,
				applicantId: event.data.applicantId,
				monthCycle: event.data.monthCycle,
				rank: event.data.rank,
			};
			if (event.data.paymentPreference === "cash") {
				return { status: "awaiting_cash_handover", ...core };
			}
			return { status: "awaiting_bank_details", ...core, poaAttempts: 0 };
		}
		case "VolunteerAssigned": {
			if (state.status === "initial") return state;
			return { ...state, volunteerId: event.data.volunteerId };
		}
		case "BankDetailsSubmitted": {
			if (state.status !== "awaiting_bank_details") return state;
			return {
				...coreFrom(state),
				status: "bank_details_submitted",
				poaAttempts: state.poaAttempts + 1,
				sortCode: event.data.sortCode,
				accountNumber: event.data.accountNumber,
				proofOfAddressRef: event.data.proofOfAddressRef,
			};
		}
		case "ProofOfAddressApproved": {
			if (state.status !== "bank_details_submitted") return state;
			return {
				...coreFrom(state),
				status: "poa_approved",
				poaAttempts: state.poaAttempts,
			};
		}
		case "ProofOfAddressRejected": {
			if (state.status !== "bank_details_submitted") return state;
			return {
				...coreFrom(state),
				status: "awaiting_bank_details",
				poaAttempts: state.poaAttempts,
			};
		}
		case "CashAlternativeOffered": {
			if (state.status !== "awaiting_bank_details") return state;
			return { ...coreFrom(state), status: "offered_cash_alternative" };
		}
		case "CashAlternativeAccepted": {
			if (state.status !== "offered_cash_alternative") return state;
			return { ...coreFrom(state), status: "awaiting_cash_handover" };
		}
		case "CashAlternativeDeclined": {
			// SlotReleased follows immediately; this is a no-op transition
			return state;
		}
		case "GrantPaid": {
			if (state.status === "initial") return state;
			return {
				...coreFrom(state),
				status: "paid",
				amount: event.data.amount,
				method: event.data.method,
				paidAt: event.data.paidAt,
			};
		}
		case "SlotReleased": {
			if (state.status === "initial") return state;
			return {
				...coreFrom(state),
				status: "released",
				reason: event.data.reason,
				releasedAt: event.data.releasedAt,
			};
		}
		default: {
			const _exhaustive: never = event;
			return state;
		}
	}
}
```

**Step 2: Run tests to verify they pass**

Run: `bun test test/unit/grantDecider.test.ts`
Expected: All 17 tests PASS

**Step 3: Commit**

```bash
git add src/domain/grant/decider.ts
git commit -m "Implement grant decider with full payment state machine"
```

---

### Task 4: Grant Process Manager — Tests

**Files:**
- Create: `src/domain/grant/processManager.ts` (stub)
- Create: `test/integration/grantCreation.test.ts`

The process manager reacts to `ApplicationSelected` events and creates grants. It needs the recipient's payment preference, so it queries the applications projection (which already stores `payment_preference`).

**Step 1: Write integration test**

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CommandHandler } from "@event-driven-io/emmett";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { submitApplication } from "../../src/domain/application/submitApplication.ts";
import type { ApplicationEvent } from "../../src/domain/application/types.ts";
import type { GrantEvent } from "../../src/domain/grant/types.ts";
import {
	decide as lotteryDecide,
	evolve as lotteryEvolve,
	initialState as lotteryInitialState,
} from "../../src/domain/lottery/decider.ts";
import { processLotteryDrawn } from "../../src/domain/lottery/processManager.ts";
import { processApplicationSelected } from "../../src/domain/grant/processManager.ts";
import type { LotteryEvent } from "../../src/domain/lottery/types.ts";
import type { RecipientRepository } from "../../src/domain/recipient/repository.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { SQLiteRecipientRepository } from "../../src/infrastructure/recipient/sqliteRecipientRepository.ts";

describe("grant creation from lottery selection", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let recipientRepo: RecipientRepository;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;
		recipientRepo = await SQLiteRecipientRepository(pool);
	});

	afterEach(async () => {
		await pool.close();
	});

	async function submitAndSelect(
		appId: string,
		phone: string,
		name: string,
		paymentPreference: "bank" | "cash",
	) {
		await submitApplication(
			{
				applicationId: appId,
				phone,
				name,
				paymentPreference,
				meetingPlace: "Mill Road",
				monthCycle: "2026-03",
				eligibility: { status: "eligible" },
			},
			eventStore,
			recipientRepo,
		);

		const lotteryHandle = CommandHandler<
			ReturnType<typeof lotteryInitialState>,
			LotteryEvent
		>({ evolve: lotteryEvolve, initialState: lotteryInitialState });

		const lotteryStream = `lottery-2026-03-${appId}`;

		await lotteryHandle(eventStore, lotteryStream, (state) =>
			lotteryDecide(
				{
					type: "CloseApplicationWindow",
					data: { monthCycle: "2026-03", closedAt: "2026-03-31T23:59:59Z" },
				},
				state,
			),
		);

		const apps = await pool.withConnection(async (conn) =>
			conn.query<{ id: string; applicant_id: string }>(
				"SELECT id, applicant_id FROM applications WHERE id = ?",
				[appId],
			),
		);

		const { newEvents } = await lotteryHandle(
			eventStore,
			lotteryStream,
			(state) =>
				lotteryDecide(
					{
						type: "DrawLottery",
						data: {
							monthCycle: "2026-03",
							volunteerId: "vol-1",
							availableBalance: 40,
							reserve: 0,
							grantAmount: 40,
							applicantPool: apps.map((a) => ({
								applicationId: a.id,
								applicantId: a.applicant_id,
							})),
							seed: "test-seed",
							drawnAt: "2026-04-01T10:00:00Z",
						},
					},
					state,
				),
		);

		const drawn = newEvents[0]!;
		await processLotteryDrawn(drawn, eventStore);
		return drawn;
	}

	test("ApplicationSelected → grant created with bank preference", async () => {
		await submitAndSelect("app-1", "07700900001", "Alice", "bank");

		// Read the ApplicationSelected event
		const { events: appEvents } =
			await eventStore.readStream<ApplicationEvent>("application-app-1");
		const selected = appEvents.find((e) => e.type === "ApplicationSelected")!;

		await processApplicationSelected(selected, eventStore, pool);

		// Verify grant stream exists with GrantCreated
		const { events: grantEvents } = await eventStore.readStream<GrantEvent>(
			`grant-app-1`,
		);
		expect(grantEvents).toHaveLength(1);
		expect(grantEvents[0]!.type).toBe("GrantCreated");
		expect(grantEvents[0]!.data.paymentPreference).toBe("bank");
		expect(grantEvents[0]!.data.applicationId).toBe("app-1");
	});

	test("ApplicationSelected → grant created with cash preference", async () => {
		await submitAndSelect("app-2", "07700900002", "Bob", "cash");

		const { events: appEvents } =
			await eventStore.readStream<ApplicationEvent>("application-app-2");
		const selected = appEvents.find((e) => e.type === "ApplicationSelected")!;

		await processApplicationSelected(selected, eventStore, pool);

		const { events: grantEvents } = await eventStore.readStream<GrantEvent>(
			`grant-app-2`,
		);
		expect(grantEvents).toHaveLength(1);
		expect(grantEvents[0]!.type).toBe("GrantCreated");
		expect(grantEvents[0]!.data.paymentPreference).toBe("cash");
	});

	test("process manager is idempotent", async () => {
		await submitAndSelect("app-3", "07700900003", "Charlie", "bank");

		const { events: appEvents } =
			await eventStore.readStream<ApplicationEvent>("application-app-3");
		const selected = appEvents.find((e) => e.type === "ApplicationSelected")!;

		await processApplicationSelected(selected, eventStore, pool);
		await processApplicationSelected(selected, eventStore, pool);

		const { events: grantEvents } = await eventStore.readStream<GrantEvent>(
			`grant-app-3`,
		);
		expect(grantEvents).toHaveLength(1);
	});
});
```

**Step 2: Run to verify it fails**

Run: `bun test test/integration/grantCreation.test.ts`
Expected: FAIL — `processManager.ts` doesn't export `processApplicationSelected`

**Step 3: Commit**

```bash
git add test/integration/grantCreation.test.ts
git commit -m "Add grant creation integration tests (red)"
```

---

### Task 5: Grant Process Manager — Implementation

**Files:**
- Create: `src/domain/grant/processManager.ts`

**Step 1: Implement the process manager**

```typescript
import { CommandHandler, IllegalStateError } from "@event-driven-io/emmett";
import type { SQLiteEventStore, SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import { decide, evolve, initialState } from "./decider.ts";
import type { GrantEvent } from "./types.ts";
import type { ApplicationSelected } from "../application/types.ts";
import type { PaymentPreference } from "../application/types.ts";

const handle = CommandHandler<ReturnType<typeof initialState>, GrantEvent>({
	evolve,
	initialState,
});

export async function processApplicationSelected(
	event: ApplicationSelected,
	eventStore: SQLiteEventStore,
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<void> {
	const { applicationId, applicantId, monthCycle, rank, selectedAt } =
		event.data;

	// Look up payment preference from applications projection
	const apps = await pool.withConnection(async (conn) =>
		conn.query<{ payment_preference: string }>(
			"SELECT payment_preference FROM applications WHERE id = ?",
			[applicationId],
		),
	);

	const paymentPreference: PaymentPreference =
		(apps[0]?.payment_preference as PaymentPreference) ?? "cash";

	const streamId = `grant-${applicationId}`;

	try {
		await handle(eventStore, streamId, (state) =>
			decide(
				{
					type: "CreateGrant",
					data: {
						grantId: applicationId,
						applicationId,
						applicantId,
						monthCycle,
						rank,
						paymentPreference,
						createdAt: selectedAt,
					},
				},
				state,
			),
		);
	} catch (e) {
		if (!(e instanceof IllegalStateError)) throw e;
		// Already created — idempotent
	}
}
```

**Step 2: Run tests**

Run: `bun test test/integration/grantCreation.test.ts`
Expected: All 3 tests PASS

**Step 3: Commit**

```bash
git add src/domain/grant/processManager.ts
git commit -m "Implement grant process manager: ApplicationSelected → CreateGrant"
```

---

### Task 6: Grant Command Handlers

**Files:**
- Create: `src/domain/grant/commandHandlers.ts`

These are thin wrappers that external code (API routes, CLI) will call. They handle stream IDs and timestamps.

**Step 1: Implement command handlers**

```typescript
import { CommandHandler } from "@event-driven-io/emmett";
import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import { decide, evolve, initialState } from "./decider.ts";
import type { GrantEvent } from "./types.ts";

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
	await handle(eventStore, streamId(grantId), (state) =>
		decide(
			{
				type: "AssignVolunteer",
				data: {
					grantId,
					volunteerId,
					assignedAt: new Date().toISOString(),
				},
			},
			state,
		),
	);
}

export async function submitBankDetails(
	grantId: string,
	data: { sortCode: string; accountNumber: string; proofOfAddressRef: string },
	eventStore: SQLiteEventStore,
): Promise<void> {
	await handle(eventStore, streamId(grantId), (state) =>
		decide(
			{
				type: "SubmitBankDetails",
				data: {
					grantId,
					...data,
					submittedAt: new Date().toISOString(),
				},
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
	await handle(eventStore, streamId(grantId), (state) =>
		decide(
			{
				type: "ApproveProofOfAddress",
				data: {
					grantId,
					verifiedBy,
					verifiedAt: new Date().toISOString(),
				},
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
	await handle(eventStore, streamId(grantId), (state) =>
		decide(
			{
				type: "RejectProofOfAddress",
				data: {
					grantId,
					reason,
					rejectedBy,
					rejectedAt: new Date().toISOString(),
				},
			},
			state,
		),
	);
}

export async function acceptCashAlternative(
	grantId: string,
	eventStore: SQLiteEventStore,
): Promise<void> {
	await handle(eventStore, streamId(grantId), (state) =>
		decide(
			{
				type: "AcceptCashAlternative",
				data: {
					grantId,
					acceptedAt: new Date().toISOString(),
				},
			},
			state,
		),
	);
}

export async function declineCashAlternative(
	grantId: string,
	eventStore: SQLiteEventStore,
): Promise<void> {
	await handle(eventStore, streamId(grantId), (state) =>
		decide(
			{
				type: "DeclineCashAlternative",
				data: {
					grantId,
					declinedAt: new Date().toISOString(),
				},
			},
			state,
		),
	);
}

export async function recordPayment(
	grantId: string,
	data: { amount: number; method: "bank" | "cash"; paidBy: string },
	eventStore: SQLiteEventStore,
): Promise<void> {
	await handle(eventStore, streamId(grantId), (state) =>
		decide(
			{
				type: "RecordPayment",
				data: {
					grantId,
					...data,
					paidAt: new Date().toISOString(),
				},
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
	await handle(eventStore, streamId(grantId), (state) =>
		decide(
			{
				type: "ReleaseSlot",
				data: {
					grantId,
					reason,
					releasedBy,
					releasedAt: new Date().toISOString(),
				},
			},
			state,
		),
	);
}
```

**Step 2: Verify it compiles**

Run: `bunx tsc --noEmit src/domain/grant/commandHandlers.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/domain/grant/commandHandlers.ts
git commit -m "Add grant command handlers"
```

---

### Task 7: Grant Projection

**Files:**
- Create: `src/infrastructure/projections/grant.ts`
- Modify: `src/infrastructure/eventStore.ts` (add projection to store)

**Step 1: Create the grant projection**

```typescript
import { sqliteProjection } from "@event-driven-io/emmett-sqlite";
import type { GrantEvent } from "../../domain/grant/types.ts";

export const grantProjection = sqliteProjection<GrantEvent>({
	canHandle: [
		"GrantCreated",
		"VolunteerAssigned",
		"BankDetailsSubmitted",
		"ProofOfAddressApproved",
		"ProofOfAddressRejected",
		"CashAlternativeOffered",
		"CashAlternativeAccepted",
		"CashAlternativeDeclined",
		"GrantPaid",
		"SlotReleased",
	],

	init: async ({ context: { connection } }) => {
		await connection.command(`
			CREATE TABLE IF NOT EXISTS grants (
				id TEXT PRIMARY KEY,
				application_id TEXT NOT NULL,
				applicant_id TEXT NOT NULL,
				month_cycle TEXT NOT NULL,
				rank INTEGER NOT NULL,
				status TEXT NOT NULL,
				payment_preference TEXT NOT NULL,
				volunteer_id TEXT,
				poa_attempts INTEGER NOT NULL DEFAULT 0,
				amount INTEGER,
				payment_method TEXT,
				paid_by TEXT,
				paid_at TEXT,
				released_reason TEXT,
				released_at TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			)
		`);
	},

	handle: async (events, { connection }) => {
		for (const { type, data } of events) {
			switch (type) {
				case "GrantCreated":
					await connection.command(
						`INSERT OR IGNORE INTO grants (id, application_id, applicant_id, month_cycle, rank, status, payment_preference, created_at, updated_at)
						 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
						[
							data.grantId,
							data.applicationId,
							data.applicantId,
							data.monthCycle,
							data.rank,
							data.paymentPreference === "cash"
								? "awaiting_cash_handover"
								: "awaiting_bank_details",
							data.paymentPreference,
							data.createdAt,
							data.createdAt,
						],
					);
					break;
				case "VolunteerAssigned":
					await connection.command(
						"UPDATE grants SET volunteer_id = ?, updated_at = ? WHERE id = ?",
						[data.volunteerId, data.assignedAt, data.grantId],
					);
					break;
				case "BankDetailsSubmitted":
					await connection.command(
						"UPDATE grants SET status = 'bank_details_submitted', poa_attempts = poa_attempts + 1, updated_at = ? WHERE id = ?",
						[data.submittedAt, data.grantId],
					);
					break;
				case "ProofOfAddressApproved":
					await connection.command(
						"UPDATE grants SET status = 'poa_approved', updated_at = ? WHERE id = ?",
						[data.verifiedAt, data.grantId],
					);
					break;
				case "ProofOfAddressRejected":
					await connection.command(
						"UPDATE grants SET status = 'awaiting_bank_details', updated_at = ? WHERE id = ?",
						[data.rejectedAt, data.grantId],
					);
					break;
				case "CashAlternativeOffered":
					await connection.command(
						"UPDATE grants SET status = 'offered_cash_alternative', updated_at = ? WHERE id = ?",
						[data.offeredAt, data.grantId],
					);
					break;
				case "CashAlternativeAccepted":
					await connection.command(
						"UPDATE grants SET status = 'awaiting_cash_handover', updated_at = ? WHERE id = ?",
						[data.acceptedAt, data.grantId],
					);
					break;
				case "CashAlternativeDeclined":
					// SlotReleased handles the actual status change
					break;
				case "GrantPaid":
					await connection.command(
						"UPDATE grants SET status = 'paid', amount = ?, payment_method = ?, paid_by = ?, paid_at = ?, updated_at = ? WHERE id = ?",
						[
							data.amount,
							data.method,
							data.paidBy,
							data.paidAt,
							data.paidAt,
							data.grantId,
						],
					);
					break;
				case "SlotReleased":
					await connection.command(
						"UPDATE grants SET status = 'released', released_reason = ?, released_at = ?, updated_at = ? WHERE id = ?",
						[
							data.reason,
							data.releasedAt,
							data.releasedAt,
							data.grantId,
						],
					);
					break;
			}
		}
	},
});
```

**Step 2: Register projection in event store**

In `src/infrastructure/eventStore.ts`, add import and register:

```typescript
import { grantProjection } from "./projections/grant.ts";
```

Add to the projections array:
```typescript
projections: inlineProjections([
	applicationsProjection,
	recipientProjection,
	volunteerProjection,
	grantProjection,
]),
```

**Step 3: Verify all existing tests still pass**

Run: `bun test`
Expected: All existing tests PASS

**Step 4: Commit**

```bash
git add src/infrastructure/projections/grant.ts src/infrastructure/eventStore.ts
git commit -m "Add grant projection and register in event store"
```

---

### Task 8: Grant Projection Integration Test

**Files:**
- Create: `test/integration/grantProjection.test.ts`

**Step 1: Write projection integration test**

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import type { GrantEvent } from "../../src/domain/grant/types.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";

describe("grant projection", () => {
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

	async function queryGrant(id: string) {
		const rows = await pool.withConnection(async (conn) =>
			conn.query<Record<string, unknown>>(
				"SELECT * FROM grants WHERE id = ?",
				[id],
			),
		);
		return rows[0];
	}

	test("GrantCreated(bank) → awaiting_bank_details row", async () => {
		await eventStore.appendToStream<GrantEvent>("grant-app-1", [
			{
				type: "GrantCreated",
				data: {
					grantId: "app-1",
					applicationId: "app-1",
					applicantId: "applicant-1",
					monthCycle: "2026-03",
					rank: 1,
					paymentPreference: "bank",
					createdAt: "2026-04-01T10:00:00Z",
				},
			},
		]);

		const grant = await queryGrant("app-1");
		expect(grant).toBeDefined();
		expect(grant!.status).toBe("awaiting_bank_details");
		expect(grant!.payment_preference).toBe("bank");
		expect(grant!.poa_attempts).toBe(0);
	});

	test("GrantCreated(cash) → awaiting_cash_handover row", async () => {
		await eventStore.appendToStream<GrantEvent>("grant-app-2", [
			{
				type: "GrantCreated",
				data: {
					grantId: "app-2",
					applicationId: "app-2",
					applicantId: "applicant-2",
					monthCycle: "2026-03",
					rank: 2,
					paymentPreference: "cash",
					createdAt: "2026-04-01T10:00:00Z",
				},
			},
		]);

		const grant = await queryGrant("app-2");
		expect(grant!.status).toBe("awaiting_cash_handover");
	});

	test("full bank path: submit details → approve POA → paid", async () => {
		await eventStore.appendToStream<GrantEvent>("grant-app-3", [
			{
				type: "GrantCreated",
				data: {
					grantId: "app-3",
					applicationId: "app-3",
					applicantId: "applicant-3",
					monthCycle: "2026-03",
					rank: 1,
					paymentPreference: "bank",
					createdAt: "2026-04-01T10:00:00Z",
				},
			},
		]);

		await eventStore.appendToStream<GrantEvent>("grant-app-3", [
			{
				type: "BankDetailsSubmitted",
				data: {
					grantId: "app-3",
					sortCode: "12-34-56",
					accountNumber: "12345678",
					proofOfAddressRef: "poa-1",
					submittedAt: "2026-04-02T10:00:00Z",
				},
			},
		]);
		expect((await queryGrant("app-3"))!.status).toBe("bank_details_submitted");
		expect((await queryGrant("app-3"))!.poa_attempts).toBe(1);

		await eventStore.appendToStream<GrantEvent>("grant-app-3", [
			{
				type: "ProofOfAddressApproved",
				data: {
					grantId: "app-3",
					verifiedBy: "vol-1",
					verifiedAt: "2026-04-03T10:00:00Z",
				},
			},
		]);
		expect((await queryGrant("app-3"))!.status).toBe("poa_approved");

		await eventStore.appendToStream<GrantEvent>("grant-app-3", [
			{
				type: "GrantPaid",
				data: {
					grantId: "app-3",
					applicationId: "app-3",
					applicantId: "applicant-3",
					monthCycle: "2026-03",
					amount: 40,
					method: "bank",
					paidBy: "vol-1",
					paidAt: "2026-04-04T10:00:00Z",
				},
			},
		]);

		const grant = await queryGrant("app-3");
		expect(grant!.status).toBe("paid");
		expect(grant!.amount).toBe(40);
		expect(grant!.payment_method).toBe("bank");
	});

	test("POA rejection cycle → cash alternative → released", async () => {
		await eventStore.appendToStream<GrantEvent>("grant-app-4", [
			{
				type: "GrantCreated",
				data: {
					grantId: "app-4",
					applicationId: "app-4",
					applicantId: "applicant-4",
					monthCycle: "2026-03",
					rank: 1,
					paymentPreference: "bank",
					createdAt: "2026-04-01T10:00:00Z",
				},
			},
		]);

		// 3 rounds of submit + reject
		for (let i = 1; i <= 3; i++) {
			await eventStore.appendToStream<GrantEvent>("grant-app-4", [
				{
					type: "BankDetailsSubmitted",
					data: {
						grantId: "app-4",
						sortCode: "12-34-56",
						accountNumber: "12345678",
						proofOfAddressRef: `poa-${i}`,
						submittedAt: `2026-04-0${i}T10:00:00Z`,
					},
				},
			]);
			await eventStore.appendToStream<GrantEvent>("grant-app-4", [
				{
					type: "ProofOfAddressRejected",
					data: {
						grantId: "app-4",
						reason: "Bad doc",
						attempt: i,
						rejectedBy: "vol-1",
						rejectedAt: `2026-04-0${i}T12:00:00Z`,
					},
				},
			]);
		}
		expect((await queryGrant("app-4"))!.poa_attempts).toBe(3);

		await eventStore.appendToStream<GrantEvent>("grant-app-4", [
			{
				type: "CashAlternativeOffered",
				data: { grantId: "app-4", offeredAt: "2026-04-03T12:00:00Z" },
			},
		]);
		expect((await queryGrant("app-4"))!.status).toBe("offered_cash_alternative");

		await eventStore.appendToStream<GrantEvent>("grant-app-4", [
			{
				type: "CashAlternativeDeclined",
				data: { grantId: "app-4", declinedAt: "2026-04-04T10:00:00Z" },
			},
		]);

		await eventStore.appendToStream<GrantEvent>("grant-app-4", [
			{
				type: "SlotReleased",
				data: {
					grantId: "app-4",
					applicationId: "app-4",
					applicantId: "applicant-4",
					monthCycle: "2026-03",
					reason: "Declined cash alternative",
					releasedBy: "system",
					releasedAt: "2026-04-04T10:00:00Z",
				},
			},
		]);

		const grant = await queryGrant("app-4");
		expect(grant!.status).toBe("released");
		expect(grant!.released_reason).toBe("Declined cash alternative");
	});
});
```

**Step 2: Run tests**

Run: `bun test test/integration/grantProjection.test.ts`
Expected: All 4 tests PASS

**Step 3: Commit**

```bash
git add test/integration/grantProjection.test.ts
git commit -m "Add grant projection integration tests"
```

---

### Task 9: End-to-End Payment Flow Test

**Files:**
- Create: `test/integration/grantPayment.test.ts`

This test exercises the full journey: application → lottery → selection → grant creation → payment, using command handlers.

**Step 1: Write e2e test**

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CommandHandler } from "@event-driven-io/emmett";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { submitApplication } from "../../src/domain/application/submitApplication.ts";
import type { ApplicationEvent } from "../../src/domain/application/types.ts";
import {
	submitBankDetails,
	approveProofOfAddress,
	rejectProofOfAddress,
	acceptCashAlternative,
	declineCashAlternative,
	recordPayment,
	releaseSlot,
	assignVolunteer,
} from "../../src/domain/grant/commandHandlers.ts";
import { processApplicationSelected } from "../../src/domain/grant/processManager.ts";
import type { GrantEvent } from "../../src/domain/grant/types.ts";
import {
	decide as lotteryDecide,
	evolve as lotteryEvolve,
	initialState as lotteryInitialState,
} from "../../src/domain/lottery/decider.ts";
import { processLotteryDrawn } from "../../src/domain/lottery/processManager.ts";
import type { LotteryEvent } from "../../src/domain/lottery/types.ts";
import type { RecipientRepository } from "../../src/domain/recipient/repository.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { SQLiteRecipientRepository } from "../../src/infrastructure/recipient/sqliteRecipientRepository.ts";

describe("grant payment end-to-end", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let recipientRepo: RecipientRepository;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;
		recipientRepo = await SQLiteRecipientRepository(pool);
	});

	afterEach(async () => {
		await pool.close();
	});

	async function selectWinner(
		appId: string,
		phone: string,
		name: string,
		paymentPreference: "bank" | "cash",
	) {
		await submitApplication(
			{
				applicationId: appId,
				phone,
				name,
				paymentPreference,
				meetingPlace: "Mill Road",
				monthCycle: "2026-03",
				eligibility: { status: "eligible" },
			},
			eventStore,
			recipientRepo,
		);

		const lotteryHandle = CommandHandler<
			ReturnType<typeof lotteryInitialState>,
			LotteryEvent
		>({ evolve: lotteryEvolve, initialState: lotteryInitialState });

		const stream = `lottery-2026-03-${appId}`;
		await lotteryHandle(eventStore, stream, (s) =>
			lotteryDecide(
				{
					type: "CloseApplicationWindow",
					data: { monthCycle: "2026-03", closedAt: "2026-03-31T23:59:59Z" },
				},
				s,
			),
		);

		const apps = await pool.withConnection(async (conn) =>
			conn.query<{ id: string; applicant_id: string }>(
				"SELECT id, applicant_id FROM applications WHERE id = ?",
				[appId],
			),
		);

		const { newEvents } = await lotteryHandle(eventStore, stream, (s) =>
			lotteryDecide(
				{
					type: "DrawLottery",
					data: {
						monthCycle: "2026-03",
						volunteerId: "vol-1",
						availableBalance: 40,
						reserve: 0,
						grantAmount: 40,
						applicantPool: apps.map((a) => ({
							applicationId: a.id,
							applicantId: a.applicant_id,
						})),
						seed: "test-seed",
						drawnAt: "2026-04-01T10:00:00Z",
					},
				},
				s,
			),
		);

		await processLotteryDrawn(newEvents[0]!, eventStore);

		const { events: appEvents } =
			await eventStore.readStream<ApplicationEvent>(`application-${appId}`);
		const selected = appEvents.find((e) => e.type === "ApplicationSelected")!;
		await processApplicationSelected(selected, eventStore, pool);
	}

	test("bank path: submit details → approve POA → pay", async () => {
		await selectWinner("app-1", "07700900001", "Alice", "bank");

		await assignVolunteer("app-1", "vol-1", eventStore);
		await submitBankDetails(
			"app-1",
			{ sortCode: "12-34-56", accountNumber: "12345678", proofOfAddressRef: "poa-1" },
			eventStore,
		);
		await approveProofOfAddress("app-1", "vol-1", eventStore);
		await recordPayment(
			"app-1",
			{ amount: 40, method: "bank", paidBy: "vol-1" },
			eventStore,
		);

		const { events } = await eventStore.readStream<GrantEvent>("grant-app-1");
		const paid = events.find((e) => e.type === "GrantPaid");
		expect(paid).toBeDefined();
		expect(paid!.data.amount).toBe(40);
		expect(paid!.data.method).toBe("bank");
	});

	test("cash path: straight to payment", async () => {
		await selectWinner("app-2", "07700900002", "Bob", "cash");

		await recordPayment(
			"app-2",
			{ amount: 40, method: "cash", paidBy: "vol-1" },
			eventStore,
		);

		const { events } = await eventStore.readStream<GrantEvent>("grant-app-2");
		const paid = events.find((e) => e.type === "GrantPaid");
		expect(paid).toBeDefined();
		expect(paid!.data.method).toBe("cash");
	});

	test("3 POA rejections → accept cash alternative → pay", async () => {
		await selectWinner("app-3", "07700900003", "Charlie", "bank");

		for (let i = 0; i < 3; i++) {
			await submitBankDetails(
				"app-3",
				{ sortCode: "12-34-56", accountNumber: "12345678", proofOfAddressRef: `poa-${i}` },
				eventStore,
			);
			await rejectProofOfAddress("app-3", "Bad document", "vol-1", eventStore);
		}

		await acceptCashAlternative("app-3", eventStore);
		await recordPayment(
			"app-3",
			{ amount: 40, method: "cash", paidBy: "vol-1" },
			eventStore,
		);

		const { events } = await eventStore.readStream<GrantEvent>("grant-app-3");
		expect(events.find((e) => e.type === "CashAlternativeOffered")).toBeDefined();
		expect(events.find((e) => e.type === "CashAlternativeAccepted")).toBeDefined();
		expect(events.find((e) => e.type === "GrantPaid")).toBeDefined();
	});

	test("3 POA rejections → decline cash → slot released", async () => {
		await selectWinner("app-4", "07700900004", "Diana", "bank");

		for (let i = 0; i < 3; i++) {
			await submitBankDetails(
				"app-4",
				{ sortCode: "12-34-56", accountNumber: "12345678", proofOfAddressRef: `poa-${i}` },
				eventStore,
			);
			await rejectProofOfAddress("app-4", "Bad document", "vol-1", eventStore);
		}

		await declineCashAlternative("app-4", eventStore);

		const { events } = await eventStore.readStream<GrantEvent>("grant-app-4");
		expect(events.find((e) => e.type === "SlotReleased")).toBeDefined();
	});

	test("volunteer releases unresponsive winner", async () => {
		await selectWinner("app-5", "07700900005", "Eve", "bank");

		await releaseSlot("app-5", "No response after 14 days", "vol-1", eventStore);

		const { events } = await eventStore.readStream<GrantEvent>("grant-app-5");
		const released = events.find((e) => e.type === "SlotReleased");
		expect(released).toBeDefined();
		expect(released!.data.reason).toBe("No response after 14 days");
	});
});
```

**Step 2: Run all tests**

Run: `bun test`
Expected: All tests PASS (unit + integration)

**Step 3: Commit**

```bash
git add test/integration/grantPayment.test.ts
git commit -m "Add end-to-end grant payment integration tests"
```

---

### Task 10: Update Workflow Doc + Lint + Final Verification

**Files:**
- Modify: `docs/workflow.md` — move grant events from "Not Yet Implemented" to "Implemented"

**Step 1: Update workflow doc**

Move these events to the implemented section:
- `GrantCreated`, `VolunteerAssigned`, `BankDetailsSubmitted`
- `ProofOfAddressApproved`, `ProofOfAddressRejected`
- `CashAlternativeOffered`, `CashAlternativeAccepted`, `CashAlternativeDeclined`
- `GrantPaid`, `SlotReleased`

Remove `GrantVolunteerAssigned` (renamed to `VolunteerAssigned`), `GrantPaymentFailed` (not needed — we use `ReleaseSlot` instead), and `FormLinkRequested` (still not implemented).

**Step 2: Lint and format**

Run: `bunx biome check --write`

**Step 3: Run all tests one final time**

Run: `bun test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "Update workflow doc: payment phase events now implemented"
```
