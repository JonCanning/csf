# Volunteer Reimbursement Tracking

## Problem

When a volunteer pays a recipient cash, they front the money personally and need to be reimbursed via Open Collective. The grant flow currently ends at `GrantPaid` with no tracking of whether the volunteer got their money back.

## Decision

Extend the grant aggregate (approach A) rather than creating a separate aggregate or tracking out-of-band. One new command, one new event, minimal state machine change.

## Design

### State machine change

- **Bank path** (unchanged): `poa_approved` -> `GrantPaid` -> `paid` (terminal)
- **Cash path** (new): `awaiting_cash_handover` -> `GrantPaid` -> `awaiting_reimbursement` -> `VolunteerReimbursed` -> `reimbursed` (terminal)

`GrantPaid` evolve branches on payment method: `bank` -> `paid`, `cash` -> `awaiting_reimbursement`.

Both `paid` and `reimbursed` are terminal states.

### New command

```
RecordReimbursement {
  grantId: string
  volunteerId: string       // the volunteer who fronted cash (self-service)
  expenseReference: string  // OC expense URL or ID
  reimbursedAt: string
}
```

Allowed from: `awaiting_reimbursement` only.

### New event

```
VolunteerReimbursed {
  grantId: string
  volunteerId: string
  expenseReference: string
  reimbursedAt: string
}
```

### Projection

Add `expense_reference` and `reimbursed_at` columns to the `grants` table. Update on `VolunteerReimbursed`.

### Cooldown

No change. Cooldown triggers from `ApplicationSelected`, not from grant terminal state.

### Constraints

- Only cash grants enter `awaiting_reimbursement`
- Volunteer records their own reimbursement (self-service)
- No OC API integration; just a reference string
