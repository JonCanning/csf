# Volunteer Reimbursement Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Track volunteer cash reimbursement via Open Collective as a new step after GrantPaid in the grant aggregate.

**Architecture:** Extend the existing grant decider with one new command (`RecordReimbursement`), one new event (`VolunteerReimbursed`), and a state split: cash grants go to `awaiting_reimbursement` after payment, bank grants stay terminal at `paid`. Both `paid` and `reimbursed` are terminal.

**Tech Stack:** TypeScript, Bun, emmett event sourcing, SQLite

---

### Task 1: Add types for reimbursement command and event

**Files:**
- Modify: `src/domain/grant/types.ts`

**Step 1: Write the new command type after `ReleaseSlot`**

```ts
export type RecordReimbursement = Command<
	"RecordReimbursement",
	{
		grantId: string;
		volunteerId: string;
		expenseReference: string;
		reimbursedAt: string;
	}
>;
```

**Step 2: Write the new event type after `SlotReleased`**

```ts
export type VolunteerReimbursed = Event<
	"VolunteerReimbursed",
	{
		grantId: string;
		volunteerId: string;
		expenseReference: string;
		reimbursedAt: string;
	}
>;
```

**Step 3: Add `RecordReimbursement` to `GrantCommand` union**

Add `| RecordReimbursement` to the `GrantCommand` type.

**Step 4: Add `VolunteerReimbursed` to `GrantEvent` union**

Add `| VolunteerReimbursed` to the `GrantEvent` type.

**Step 5: Add `awaiting_reimbursement` and `reimbursed` states to `GrantState`**

Add two new union members:

```ts
| (GrantCore & {
		status: "awaiting_reimbursement";
		amount: number;
		paidBy: string;
		paidAt: string;
  })
| (GrantCore & {
		status: "reimbursed";
		amount: number;
		paidBy: string;
		paidAt: string;
		expenseReference: string;
		reimbursedAt: string;
  })
```

Remove `method` from the `paid` state — if it's in `paid`, it was bank. If `reimbursed`, it was cash.

**Step 6: Commit**

```bash
git add src/domain/grant/types.ts
git commit -m "Add reimbursement types to grant aggregate"
```

---

### Task 2: Update decider — evolve splits GrantPaid by method

**Files:**
- Modify: `src/domain/grant/decider.ts`
- Test: `test/unit/grantDecider.test.ts`

**Step 1: Write failing test — cash GrantPaid evolves to awaiting_reimbursement**

Add to `test/unit/grantDecider.test.ts`:

```ts
test("GrantPaid with cash → awaiting_reimbursement", () => {
	const state: GrantState = {
		...cashCore,
		status: "awaiting_cash_handover",
	};
	const next = evolve(state, {
		type: "GrantPaid",
		data: {
			grantId: "g1",
			applicationId: "app-1",
			applicantId: "applicant-1",
			monthCycle: "2026-03",
			amount: 40,
			method: "cash",
			paidBy: "vol-1",
			paidAt: "2026-04-01T10:00:00Z",
		},
	});
	expect(next.status).toBe("awaiting_reimbursement");
	expect(next).toMatchObject({ paidBy: "vol-1", amount: 40 });
});
```

Where `cashCore` is a helper:

```ts
const cashCore = {
	grantId: "g1",
	applicationId: "app-1",
	applicantId: "applicant-1",
	monthCycle: "2026-03",
	rank: 1,
	volunteerId: "vol-1",
};
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/grantDecider.test.ts`
Expected: FAIL — status is `paid` not `awaiting_reimbursement`

**Step 3: Update evolve for GrantPaid**

In `decider.ts`, change the `GrantPaid` case in `evolve`:

```ts
case "GrantPaid": {
	if (state.status === "initial") return state;
	const base = {
		grantId: state.grantId,
		applicationId: state.applicationId,
		applicantId: state.applicantId,
		monthCycle: state.monthCycle,
		rank: state.rank,
		volunteerId: state.volunteerId,
		amount: event.data.amount,
		paidBy: event.data.paidBy,
		paidAt: event.data.paidAt,
	};
	if (event.data.method === "cash") {
		return { ...base, status: "awaiting_reimbursement" };
	}
	return { ...base, status: "paid" };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test test/unit/grantDecider.test.ts`
Expected: PASS

**Step 5: Write failing test — bank GrantPaid still goes to paid**

```ts
test("GrantPaid with bank → paid", () => {
	const state: GrantState = {
		...cashCore,
		status: "poa_approved",
		poaAttempts: 1,
	};
	const next = evolve(state, {
		type: "GrantPaid",
		data: {
			grantId: "g1",
			applicationId: "app-1",
			applicantId: "applicant-1",
			monthCycle: "2026-03",
			amount: 40,
			method: "bank",
			paidBy: "vol-1",
			paidAt: "2026-04-01T10:00:00Z",
		},
	});
	expect(next.status).toBe("paid");
});
```

**Step 6: Run test — should already pass**

Run: `bun test test/unit/grantDecider.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add src/domain/grant/decider.ts test/unit/grantDecider.test.ts
git commit -m "Split GrantPaid evolve: cash -> awaiting_reimbursement, bank -> paid"
```

---

### Task 3: Update decider — decide for RecordReimbursement

**Files:**
- Modify: `src/domain/grant/decider.ts`
- Test: `test/unit/grantDecider.test.ts`

**Step 1: Write failing test — RecordReimbursement from awaiting_reimbursement**

```ts
test("RecordReimbursement from awaiting_reimbursement → VolunteerReimbursed", () => {
	const state: GrantState = {
		...cashCore,
		status: "awaiting_reimbursement",
		amount: 40,
		paidBy: "vol-1",
		paidAt: "2026-04-01T10:00:00Z",
	};
	const events = decide(
		{
			type: "RecordReimbursement",
			data: {
				grantId: "g1",
				volunteerId: "vol-1",
				expenseReference: "https://opencollective.com/csf/expenses/123",
				reimbursedAt: "2026-04-05T10:00:00Z",
			},
		},
		state,
	);
	expect(events).toHaveLength(1);
	expect(events[0].type).toBe("VolunteerReimbursed");
	expect(events[0].data.expenseReference).toBe(
		"https://opencollective.com/csf/expenses/123",
	);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/grantDecider.test.ts`
Expected: FAIL — no case for RecordReimbursement

**Step 3: Write failing test — RecordReimbursement from wrong state throws**

```ts
test("RecordReimbursement from paid throws", () => {
	const state: GrantState = {
		...cashCore,
		status: "paid",
		amount: 40,
		paidAt: "2026-04-01T10:00:00Z",
	};
	expect(() =>
		decide(
			{
				type: "RecordReimbursement",
				data: {
					grantId: "g1",
					volunteerId: "vol-1",
					expenseReference: "ref-1",
					reimbursedAt: "2026-04-05T10:00:00Z",
				},
			},
			state,
		),
	).toThrow(/cannot record reimbursement/i);
});
```

**Step 4: Implement decideRecordReimbursement in decider.ts**

Add the case to the `decide` switch and the new function:

```ts
case "RecordReimbursement":
	return decideRecordReimbursement(command, state);
```

```ts
function decideRecordReimbursement(
	command: RecordReimbursement,
	state: GrantState,
): GrantEvent[] {
	if (state.status !== "awaiting_reimbursement") {
		throw new IllegalStateError(
			`Cannot record reimbursement in ${state.status} state`,
		);
	}
	return [
		{
			type: "VolunteerReimbursed",
			data: { ...command.data },
		},
	];
}
```

Add `RecordReimbursement` to the imports from `./types.ts`.

**Step 5: Add VolunteerReimbursed to evolve**

```ts
case "VolunteerReimbursed": {
	if (state.status !== "awaiting_reimbursement") return state;
	return {
		grantId: state.grantId,
		applicationId: state.applicationId,
		applicantId: state.applicantId,
		monthCycle: state.monthCycle,
		rank: state.rank,
		volunteerId: state.volunteerId,
		status: "reimbursed",
		amount: state.amount,
		paidBy: state.paidBy,
		paidAt: state.paidAt,
		expenseReference: event.data.expenseReference,
		reimbursedAt: event.data.reimbursedAt,
	};
}
```

**Step 6: Update isNonTerminal to exclude `awaiting_reimbursement` and `reimbursed`**

`awaiting_reimbursement` and `reimbursed` should be terminal for assignment/release purposes. Add them alongside `paid` and `released` in `isNonTerminal`.

**Step 7: Run all tests**

Run: `bun test test/unit/grantDecider.test.ts`
Expected: PASS

**Step 8: Commit**

```bash
git add src/domain/grant/decider.ts test/unit/grantDecider.test.ts
git commit -m "Add RecordReimbursement command and VolunteerReimbursed event to grant decider"
```

---

### Task 4: Add command handler for recordReimbursement

**Files:**
- Modify: `src/domain/grant/commandHandlers.ts`

**Step 1: Add the recordReimbursement handler**

```ts
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
```

**Step 2: Commit**

```bash
git add src/domain/grant/commandHandlers.ts
git commit -m "Add recordReimbursement command handler"
```

---

### Task 5: Update grant projection

**Files:**
- Modify: `src/infrastructure/projections/grant.ts`
- Test: `test/integration/grantProjection.test.ts`

**Step 1: Write failing test — VolunteerReimbursed updates projection**

Add to `test/integration/grantProjection.test.ts` a test that runs a cash grant through to reimbursement and checks the projection has `status = 'reimbursed'`, `expense_reference`, and `reimbursed_at`.

**Step 2: Run test to verify it fails**

Run: `bun test test/integration/grantProjection.test.ts`
Expected: FAIL

**Step 3: Update projection**

Add `VolunteerReimbursed` to the `canHandle` array.

In `init`, add columns to the CREATE TABLE:

```sql
expense_reference TEXT,
reimbursed_at TEXT
```

In `handle`, add the case:

```ts
case "VolunteerReimbursed":
	await connection.command(
		"UPDATE grants SET status = 'reimbursed', expense_reference = ?, reimbursed_at = ?, updated_at = ? WHERE id = ?",
		[data.expenseReference, data.reimbursedAt, data.reimbursedAt, data.grantId],
	);
	break;
```

Also update the `GrantPaid` case to set status based on method:

```ts
case "GrantPaid": {
	const grantStatus = data.method === "cash" ? "awaiting_reimbursement" : "paid";
	await connection.command(
		"UPDATE grants SET status = ?, amount = ?, payment_method = ?, paid_by = ?, paid_at = ?, updated_at = ? WHERE id = ?",
		[grantStatus, data.amount, data.method, data.paidBy, data.paidAt, data.paidAt, data.grantId],
	);
	break;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test test/integration/grantProjection.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/infrastructure/projections/grant.ts test/integration/grantProjection.test.ts
git commit -m "Add reimbursement tracking to grant projection"
```

---

### Task 6: Update e2e payment tests

**Files:**
- Modify: `test/integration/grantPayment.test.ts`

**Step 1: Write test — cash payment ends in awaiting_reimbursement, then reimbursed**

Update the existing "cash path: straight to payment" test to verify the grant is in `awaiting_reimbursement` after `recordPayment`, then call `recordReimbursement` and verify `VolunteerReimbursed`.

```ts
test("cash path: payment -> reimbursement", async () => {
	const appId = "app-cash-reimburse";
	await selectWinner(appId, "07700900030", "Frank", "cash");

	await recordPayment(
		appId,
		{ amount: 40, method: "cash", paidBy: "vol-1" },
		eventStore,
	);
	await recordReimbursement(
		appId,
		{
			volunteerId: "vol-1",
			expenseReference: "https://opencollective.com/csf/expenses/456",
		},
		eventStore,
	);

	const { events } = await eventStore.readStream<GrantEvent>(
		`grant-${appId}`,
	);
	const reimbursed = events.find((e) => e.type === "VolunteerReimbursed");
	expect(reimbursed).toBeDefined();
	expect(reimbursed!.data.expenseReference).toBe(
		"https://opencollective.com/csf/expenses/456",
	);
});
```

**Step 2: Write test — bank path does NOT enter awaiting_reimbursement**

```ts
test("bank path: no reimbursement step", async () => {
	const appId = "app-bank-no-reimburse";
	await selectWinner(appId, "07700900031", "Grace", "bank");

	await submitBankDetails(appId, {
		sortCode: "12-34-56",
		accountNumber: "12345678",
		proofOfAddressRef: "poa-ref-1",
	}, eventStore);
	await approveProofOfAddress(appId, "vol-1", eventStore);
	await recordPayment(
		appId,
		{ amount: 40, method: "bank", paidBy: "vol-1" },
		eventStore,
	);

	await expect(
		recordReimbursement(
			appId,
			{ volunteerId: "vol-1", expenseReference: "ref-1" },
			eventStore,
		),
	).rejects.toThrow(/cannot record reimbursement/i);
});
```

**Step 3: Run all tests**

Run: `bun test`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add test/integration/grantPayment.test.ts
git commit -m "Add reimbursement e2e tests for cash and bank paths"
```

---

### Task 7: Update workflow doc

**Files:**
- Modify: `docs/workflow.md`

**Step 1: Update the grant commands table**

Add `RecordReimbursement` row:

| `RecordReimbursement` | Volunteer | awaiting_reimbursement | Records OC expense reference; grant complete |

**Step 2: Update the grant events table**

Add `VolunteerReimbursed` row:

| `VolunteerReimbursed` | Volunteer records reimbursement | Grant fully closed |

**Step 3: Move "Record reimbursement" from not-yet-implemented to implemented in the volunteer actions section**

**Step 4: Commit**

```bash
git add docs/workflow.md
git commit -m "Update workflow doc with reimbursement tracking"
```

---

### Task 8: Final verification

**Step 1: Run full test suite**

Run: `bun test`
Expected: ALL PASS

**Step 2: Lint and format**

Run: `bunx biome check --write`

**Step 3: Commit any formatting changes**

**Step 4: Run tests one final time**

Run: `bun test`
Expected: ALL PASS
