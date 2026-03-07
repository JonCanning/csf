# Recipients Manager Design

## Overview

A dashboard page for volunteers to manage grant recipients. Table view with a slide-out detail panel for viewing, editing, creating, and deleting recipients.

## Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/recipients` | Full page — table of all recipients |
| GET | `/recipients/new` | SSE fragment — empty create form in slide-out |
| GET | `/recipients/:id` | SSE fragment — recipient detail in slide-out |
| POST | `/recipients` | Create new recipient |
| PUT | `/recipients/:id` | Update existing recipient |
| DELETE | `/recipients/:id` | Delete recipient |

## Page Layout

Top bar with back link to dashboard, "Recipients" heading, and amber "Add Recipient" button. Below that, a search input. Below that, a table.

### Table Columns

| Column | Source | Notes |
|--------|--------|-------|
| Name | `name` | Primary identifier |
| Phone | `phone` | Formatted |
| Payment | `payment_preference` | Pill badge: bank or cash |
| Added | `created_at` | Relative or short date |

Clicking a row opens the slide-out detail panel on the right.

### Slide-out Detail Panel

Right-aligned panel (w-96) that slides in over the table content. Three modes:

**View mode** — displays all recipient fields as read-only text. Two buttons at bottom: Edit (secondary) and Delete (danger text).

**Edit mode** — same fields as form inputs. Save (amber) and Cancel buttons. Entered by clicking Edit in view mode.

**Create mode** — empty form with all fields. Create (amber) and Cancel buttons. Entered by clicking "Add Recipient" in the top bar.

### Fields (all modes)

- Name (text, required)
- Phone (tel, required)
- Email (email, optional)
- Payment Preference (radio: bank / cash)
- Sort Code (text, shown when payment = bank)
- Account Number (text, shown when payment = bank)
- Meeting Place (text, shown when payment = cash)
- Notes (textarea, optional)

### Delete Confirmation

Clicking Delete replaces the button with inline "Are you sure?" text plus Confirm (red) and Cancel buttons. No modal.

## Interactivity

### Datastar Signals

- `search` — bound to search input, filters table rows client-side
- `selectedId` — tracks which recipient's panel is open
- `panelMode` — "view" | "edit" | "create"

### SSE Endpoints

Detail panel content fetched via Datastar SSE (`data-on-click` with `$$get`). Form submissions use `$$post` / `$$put` / `$$delete` to mutate, then merge updated HTML fragments back.

### Client-side Search

Filter table rows by matching `search` signal against name and phone fields using `data-show`. No server round-trip — dataset is small enough.

## File Structure

New files:
- `src/web/pages/recipients.ts` — page HTML generators (table, panel, form)
- `src/web/routes/recipients.ts` — route handlers

Modified files:
- `src/web/server.ts` — register recipient routes
- `src/domain/recipient/repository.ts` — may need search/filter methods

## Visual Design

Matches existing cream/bark/amber palette. Table uses `bg-cream-50` rows with `border-cream-200` dividers. Slide-out panel uses `bg-cream-50` with left border `border-cream-200` and subtle shadow. Payment preference shown as small pill badges. All typography uses existing `font-heading` (Fraunces) for headings and `font-body` (Source Serif 4) for content.
