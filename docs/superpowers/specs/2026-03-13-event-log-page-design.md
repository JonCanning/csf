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
- Page number parsed from `?page=` query param, defaulting to 1, clamped to `[1, totalPages]`
- Uses `bun:sqlite` directly (same pattern as existing projections)

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
| ApplicationSubmitted | Application submitted · ref **{referenceToken}** |
| ApplicationAccepted | Application **{ref}** accepted |
| ApplicationRejected | Application **{ref}** rejected · *{reason}* |
| ApplicationFlaggedForReview | Application **{ref}** flagged · *{reason}* |
| ApplicationSelected | Application **{ref}** selected · rank {rank} |
| ApplicationNotSelected | Application **{ref}** not selected |
| ApplicationConfirmed | Application **{ref}** confirmed |
| ApplicantCreated | Applicant **{name}** created |
| ApplicantUpdated | Applicant **{name}** updated |
| ApplicantDeleted | Applicant deleted |
| VolunteerCreated | Volunteer **{name}** created |
| VolunteerUpdated | Volunteer **{name}** updated |
| VolunteerDisabled | Volunteer disabled |
| VolunteerEnabled | Volunteer re-enabled |
| PasswordChanged | Password changed |
| GrantCreated | Grant created · {paymentPreference} |
| GrantPaid | **£{amount}** paid via {method} |
| SlotReleased | Grant slot released · {reason} |
| VolunteerAssigned | Volunteer assigned to grant |
| BankDetailsUpdated | Bank details updated |
| ProofOfAddressApproved | Proof of address approved |
| ProofOfAddressRejected | Proof of address rejected · {reason} |
| CashAlternativeOffered | Cash alternative offered |
| CashAlternativeAccepted | Cash alternative accepted |
| CashAlternativeDeclined | Cash alternative declined |
| VolunteerReimbursed | Volunteer reimbursed · ref {expenseReference} |
| LotteryDrawn | **{n}** selected · **£{grantAmount}** each · cycle {monthCycle} |
| ApplicationWindowOpened | Application window opened · {monthCycle} |
| ApplicationWindowClosed | Application window closed · {monthCycle} |
| *(unknown)* | *(no description — type badge only)* |

All user-supplied strings rendered through `escapeHtml()` before insertion into HTML.

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
