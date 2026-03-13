# Event Log Page — Design Spec

**Date:** 2026-03-13
**Status:** Approved

## Overview

A new admin-only dashboard page showing a paginated, chronological history of all domain events stored in the event store. Intended for diagnostics — understanding what happened and when across the whole system.

## Scope

- Read-only view. No filtering, search, or actions.
- Admin volunteers only.
- 25 events per page, newest-first.

## Route & Auth

- `GET /logs` — renders page 1
- `GET /logs?page=N` — renders page N (1-indexed, clamped to valid range)
- Auth guard: redirect to `/login` if no session; 403 if not admin
- Follows the same pattern as the existing `/volunteers` admin route

## Dashboard Integration

A new nav card added to the dashboard grid, visible to admin volunteers only:

- Icon: 📋
- Title: Event Log
- Description: Diagnostic event history
- Href: `/logs`

## Data Layer

Direct SQL query on Emmett's `emt_messages` table. No new projections or tables.

```sql
-- Events (paginated)
SELECT global_position, created, message_type, message_data
FROM emt_messages
WHERE message_kind = 'E'
ORDER BY global_position DESC
LIMIT 25 OFFSET ?

-- Total count (for pagination)
SELECT COUNT(*) AS total
FROM emt_messages
WHERE message_kind = 'E'
```

- `OFFSET` = `(page - 1) * 25`
- Page number parsed from `?page=` query param, defaulting to 1, clamped to `[1, max(1, totalPages)]`
- Uses `bun:sqlite` via the existing `SQLiteConnectionPool` — **not** a new DB connection
- `message_data` is stored as a JSON string; rows must be `JSON.parse(row.message_data)` before field access
- OFFSET-based pagination is intentional: this fund will accumulate at most thousands of events, never millions, so full-scan costs are negligible. Cursor-based pagination is not required.

**DB injection:** The logs route factory receives `pool` (a `SQLiteConnectionPool`) as a constructor argument, same as existing routes. Queries run via `pool.withConnection(async (conn) => { ... })`. `pool` is passed from `server.ts` when instantiating the route.

**Edge cases:**
- 0 events: render the table with no rows, "0 events", pagination shows "Page 1 of 1" (totalPages clamped to minimum 1)
- `?page=` out of range: clamp silently (no 404)
- DB error: return a plain 500 response with message "Internal error"
- Malformed `message_data` (invalid JSON): catch parse error, fall through to unknown-type rendering (type badge only, no description)

## Page Layout

Compact table matching the app's existing visual language (cream/bark palette, Fraunces headings, Tailwind v4).

**Columns:** `#` · Time · Type · Description

- `#` — `global_position` (monospaced, muted)
- Time — `created` formatted as relative time ("2 min ago", "Yesterday", absolute date for older)
- Type — `message_type` as a coloured badge, colour-coded by domain prefix
- Description — human-readable sentence extracted from `message_data`

**Pagination controls** above and/or below the table: Prev / page numbers / Next.

## Badge Colours by Domain

| Prefix | Colour |
|--------|--------|
| Application* | Amber/yellow (`#fef3c7` bg, `#92400e` text) |
| Applicant* | Blue (`#dbeafe` bg, `#1e40af` text) |
| Volunteer*, Password* | Purple (`#f3e8ff` bg, `#6b21a8` text) |
| Grant*, *Reimbursed | Green (`#dcfce7` bg, `#166534` text) |
| Lottery*, *Window* | Pink (`#fce7f3` bg, `#9d174d` text) |

## Description Sentences

Each event type maps to a sentence template. Bold tokens are pulled from `message_data`.

| Event | Sentence |
|-------|----------|
| ApplicationSubmitted | Application submitted · ref **{applicationId[0..8]}** |
| ApplicationAccepted | Application **{applicationId[0..8]}** accepted |
| ApplicationRejected | Application **{applicationId[0..8]}** rejected · *{reason}* |
| ApplicationFlaggedForReview | Application **{applicationId[0..8]}** flagged · *{reason}* |
| ApplicationSelected | Application **{applicationId[0..8]}** selected · rank {rank} |
| ApplicationNotSelected | Application **{applicationId[0..8]}** not selected |
| ApplicationConfirmed | Application **{applicationId[0..8]}** confirmed |
| ApplicantCreated | Applicant **{name}** created |
| ApplicantUpdated | Applicant **{name}** updated |
| ApplicantDeleted | Applicant deleted |
| VolunteerCreated | Volunteer **{name}** created |
| VolunteerUpdated | Volunteer **{name}** updated |
| VolunteerDisabled | Volunteer disabled |
| VolunteerEnabled | Volunteer re-enabled |
| PasswordChanged | Password changed |
| GrantCreated | Grant created · {paymentPreference} |
| GrantPaid | **£{amount}** paid via {method} (`method` field from event data) |
| SlotReleased | Grant slot released · {reason} |
| VolunteerAssigned | Volunteer assigned to grant |
| BankDetailsUpdated | Bank details updated |
| ProofOfAddressApproved | Proof of address approved |
| ProofOfAddressRejected | Proof of address rejected · {reason} |
| CashAlternativeOffered | Cash alternative offered |
| CashAlternativeAccepted | Cash alternative accepted |
| CashAlternativeDeclined | Cash alternative declined |
| VolunteerReimbursed | Volunteer reimbursed · ref {expenseReference} |
| LotteryDrawn | **{selected.length}** selected · **£{grantAmount}** each · cycle {monthCycle} (`slots` field intentionally omitted — selected count is more informative) |
| ApplicationWindowOpened | Application window opened · {monthCycle} |
| ApplicationWindowClosed | Application window closed · {monthCycle} |
| *(unknown)* | *(no description — type badge only)* |

All user-supplied strings rendered through `escapeHtml()` before insertion into HTML. `escapeHtml` is a local copy in `logs.ts` (following the pattern of other page files — it is not imported from another module).

## Files

| File | Change |
|------|--------|
| `src/web/pages/logs.ts` | New — page HTML + table rendering + sentence formatter |
| `src/web/routes/logs.ts` | New — DB query, pagination logic, request handler |
| `src/web/server.ts` | Register `/logs` route with admin auth guard |
| `src/web/pages/dashboard.ts` | Add admin-only nav card for Event Log |

## Testing

- Unit tests for the sentence formatter (`describeEvent`) covering each event type and the unknown fallback
- Unit tests for pagination logic (offset calculation, page clamping)
- Route-level tests: 403 for non-admin, redirect for unauthenticated, valid HTML response for admin
