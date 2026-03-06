# Lottery System Design

## Context

Applications are currently accepted directly into grants. The workflow requires a lottery phase: applications collect during a window, then winners are randomly drawn at month end, limited by available funds.

## Decisions

- **Lottery aggregate** (not a process manager) — the draw is an atomic batch decision with its own invariants, auditable seed, and waitlist state
- **Two-step manual trigger** — scheduler closes the window automatically; a volunteer manually triggers the draw after checking the Open Collective dashboard
- **System-generated seed** — `crypto.randomUUID()` stored on the event for auditability
- **Approach B** — lottery aggregate records the full draw; a process manager dispatches selection commands back to individual application streams
- **Applications projection replaces grants projection** — grants projection deferred until payment phase is built
- **Balance passed as command data** — volunteer provides the OC balance when triggering the draw; aggregate stays pure

## Lottery Aggregate

Stream: `lottery-{monthCycle}` (e.g. `lottery-2026-03`)

### Commands

| Command | Trigger | Data |
|---------|---------|------|
| `CloseApplicationWindow` | Scheduler (month end) | `monthCycle`, `closedAt` |
| `DrawLottery` | Volunteer (manual) | `volunteerId`, `availableBalance`, `reserve`, `grantAmount`, `applicantPool: [{applicationId, applicantId}]`, `seed` |

### Events

| Event | Data |
|-------|------|
| `ApplicationWindowClosed` | `monthCycle`, `closedAt` |
| `LotteryDrawn` | `monthCycle`, `volunteerId`, `seed`, `slots`, `availableBalance`, `reserve`, `grantAmount`, `selected: [{applicationId, applicantId, rank}]`, `notSelected: [{applicationId, applicantId}]`, `drawnAt` |

### State Machine

```
initial → [CloseApplicationWindow] → windowClosed → [DrawLottery] → drawn
```

### Invariants

- Can't close an already-closed window
- Can't draw if window isn't closed
- Can't draw twice
- `slots = floor((availableBalance - reserve) / grantAmount)`

## Application Aggregate Changes

### New Commands

| Command | Data |
|---------|------|
| `SelectApplication` | `applicationId`, `lotteryMonthCycle`, `rank`, `selectedAt` |
| `RejectFromLottery` | `applicationId`, `lotteryMonthCycle`, `rejectedAt` |

### New Events

| Event | Data |
|-------|------|
| `ApplicationSelected` | `applicationId`, `applicantId`, `monthCycle`, `rank`, `selectedAt` |
| `ApplicationNotSelected` | `applicationId`, `applicantId`, `monthCycle`, `notSelectedAt` |

### Updated State Machine

```
initial
  → submitted
    → accepted (eligible, new/matched identity)
    → flagged (identity mismatch)
    → rejected (cooldown/duplicate)

flagged
  → confirmed (volunteer confirms + eligible)
  → rejected (volunteer rejects or ineligible)

accepted/confirmed
  → selected (lottery win)
  → not_selected (lottery loss)
```

## Process Manager

Listens for `LotteryDrawn`. For each entry in `selected[]`, dispatches `SelectApplication`. For each in `notSelected[]`, dispatches `RejectFromLottery`.

Idempotent: application decider rejects commands if already in `selected`/`not_selected` state. Safe to replay.

## Applications Projection (replaces grants)

Table: `applications`

| Column | Type |
|--------|------|
| `id` | TEXT PK |
| `applicant_id` | TEXT |
| `month_cycle` | TEXT |
| `status` | TEXT (applied, accepted, flagged, confirmed, rejected, selected, not_selected) |
| `rank` | INTEGER (null until selected) |
| `payment_preference` | TEXT |
| `reject_reason` | TEXT |
| `applied_at` | TEXT |
| `accepted_at` | TEXT |
| `selected_at` | TEXT |
| `rejected_at` | TEXT |

Handles: `ApplicationSubmitted`, `ApplicationAccepted`, `ApplicationConfirmed`, `ApplicationRejected`, `ApplicationFlaggedForReview`, `ApplicationSelected`, `ApplicationNotSelected`

### Eligibility Queries

- **Cooldown:** any application with status `selected` in last 3 months
- **Duplicate:** any application in current monthCycle (any status)

## Seeded RNG

Pure function: `(seed: string, pool: T[]) => T[]`

- Seed → deterministic PRNG (mulberry32 or xorshift128)
- Fisher-Yates shuffle
- First N items are winners (ranked 1..N), rest are losers
- Same seed + same pool = same result, always

File: `src/domain/lottery/seededShuffle.ts`

## Files Changed

| File | Action |
|------|--------|
| `src/domain/lottery/types.ts` | New — lottery commands, events, state |
| `src/domain/lottery/decider.ts` | New — lottery aggregate |
| `src/domain/lottery/seededShuffle.ts` | New — pure seeded RNG + shuffle |
| `src/domain/lottery/processManager.ts` | New — fan-out selection commands |
| `src/domain/application/types.ts` | Add Selected/NotSelected events + commands + states |
| `src/domain/application/decider.ts` | Handle new commands + states |
| `src/infrastructure/projections/applications.ts` | New — replaces grants projection |
| `src/infrastructure/projections/grants.ts` | Delete |
| `src/domain/application/checkEligibility.ts` | Query applications projection |
| `src/infrastructure/eventStore.ts` | Swap grants → applications projection |
| `test/` | New + reworked tests |
