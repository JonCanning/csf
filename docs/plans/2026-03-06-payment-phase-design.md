# Payment Phase Design

## Decision: Separate Grant Aggregate

The payment lifecycle lives in a new **Grant** aggregate, not inside Application.
`ApplicationSelected` triggers grant creation via a process manager, similar to how `LotteryDrawn` fans out selection commands today.

Stream ID: `grant-{grantId}`

## Grant State Machine

```
GrantCreated(bank)
  -> AwaitingBankDetails
    -> BankDetailsSubmitted -> POA review
      -> ProofOfAddressApproved -> Paid (done)
      -> ProofOfAddressRejected (attempt < 3) -> AwaitingBankDetails
      -> ProofOfAddressRejected (attempt = 3) -> OfferedCashAlternative
        -> CashAlternativeAccepted -> AwaitingCashHandover -> Paid (done)
        -> CashAlternativeDeclined -> Released (done)

GrantCreated(cash)
  -> AwaitingCashHandover -> Paid (done)

Any non-terminal state -> Released (volunteer manually releases for no-shows/timeouts)
```

Terminal states: `paid`, `released`

## Events

| Event | Data | When |
|-------|------|------|
| `GrantCreated` | grantId, applicationId, applicantId, monthCycle, paymentPreference, rank | Process manager reacts to ApplicationSelected |
| `VolunteerAssigned` | grantId, volunteerId | Volunteer claims a grant |
| `BankDetailsSubmitted` | grantId, sortCode, accountNumber, proofOfAddressRef | Recipient submits bank details + POA |
| `ProofOfAddressApproved` | grantId, verifiedBy, verifiedAt | Volunteer approves POA |
| `ProofOfAddressRejected` | grantId, reason, attempt, rejectedBy | Volunteer rejects POA (1-3) |
| `CashAlternativeOffered` | grantId, offeredAt | Auto after 3rd POA rejection |
| `CashAlternativeAccepted` | grantId, acceptedAt | Recipient accepts cash |
| `CashAlternativeDeclined` | grantId, declinedAt | Recipient declines cash |
| `GrantPaid` | grantId, amount, method (bank/cash), paidAt | Payment recorded |
| `SlotReleased` | grantId, reason, releasedAt | Slot freed (timeout, decline, volunteer action) |

## Commands

| Command | Allowed From States |
|---------|-------------------|
| `CreateGrant` | (initial) |
| `AssignVolunteer` | any non-terminal |
| `SubmitBankDetails` | awaiting_bank_details |
| `ApproveProofOfAddress` | bank_details_submitted |
| `RejectProofOfAddress` | bank_details_submitted |
| `AcceptCashAlternative` | offered_cash_alternative |
| `DeclineCashAlternative` | offered_cash_alternative |
| `RecordPayment` | awaiting_bank_details (POA approved), awaiting_cash_handover |
| `ReleaseSlot` | any non-terminal |

## State Shape

```typescript
type GrantState =
  | { status: "initial" }
  | { status: "awaiting_bank_details"; grantId: string; applicationId: string; applicantId: string; monthCycle: string; rank: number; volunteerId?: string; poaAttempts: number }
  | { status: "bank_details_submitted"; /* + bankDetails, poaRef */ }
  | { status: "offered_cash_alternative"; /* same core fields */ }
  | { status: "awaiting_cash_handover"; /* same core fields */ }
  | { status: "paid"; method: "bank" | "cash"; paidAt: string }
  | { status: "released"; reason: string; releasedAt: string }
```

## Process Manager: Grant Creation

Subscribes to `ApplicationSelected` events.
For each selected application, dispatches `CreateGrant` with the applicant's payment preference (looked up from recipient projection).

Idempotent: if grant already exists for that applicationId, catches IllegalStateError.

## Projection

New `grants` table in the applications projection (or its own projection):

| Column | Type |
|--------|------|
| id | TEXT PK |
| application_id | TEXT |
| applicant_id | TEXT |
| month_cycle | TEXT |
| rank | INTEGER |
| status | TEXT |
| payment_preference | TEXT |
| volunteer_id | TEXT NULL |
| poa_attempts | INTEGER DEFAULT 0 |
| amount | INTEGER NULL |
| payment_method | TEXT NULL |
| paid_at | TEXT NULL |
| released_reason | TEXT NULL |
| created_at | TEXT |
| updated_at | TEXT |

## Timer-Based Behaviors

Not automated yet. Volunteers manually trigger:
- `ReleaseSlot` for unresponsive winners
- Reminders handled outside the system for now

Automation (polling/cron) can be layered on later.

## File Structure

```
src/domain/grant/types.ts          -- events, commands, state types
src/domain/grant/decider.ts        -- decide + evolve + initialState
src/domain/grant/processManager.ts -- ApplicationSelected -> CreateGrant
src/domain/grant/commandHandlers.ts
src/infrastructure/projections/grant.ts
test/unit/grant.test.ts
test/integration/grantPayment.test.ts
```
