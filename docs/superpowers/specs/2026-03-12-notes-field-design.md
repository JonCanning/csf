# Notes Field for Applicants and Grants

**Date:** 2026-03-12
**Status:** Approved

## Overview

Add a freeform `notes` text field to both applicants and grants. Notes are informal staff scratch space — no audit trail, no business logic, no domain events.

## Data Layer

### Schema

Add `notes TEXT` (nullable) to both `applicants` and `grants` SQLite tables.

Migration strategy: run `ALTER TABLE applicants ADD COLUMN notes TEXT` and `ALTER TABLE grants ADD COLUMN notes TEXT` at startup, suppressing the error if the column already exists (SQLite does not support `ADD COLUMN IF NOT EXISTS`). This runs in the repository `init` alongside the existing `CREATE TABLE IF NOT EXISTS`.

### Types

- `Applicant` (domain type): add `notes?: string`
- `GrantRow` (repository type): add `notes: string | null`

### Repository Methods

Add `updateNotes(id: string, notes: string): Promise<void>` to:
- `ApplicantRepository` interface + `SQLiteApplicantRepository` implementation
- `GrantRepository` interface + `SQLiteGrantRepository` implementation

Both implementations execute a direct `UPDATE ... SET notes = ? WHERE id = ?`. No event store involvement.

The existing `rowToApplicant` and `rowToGrant` mapping functions are updated to map the `notes` column.

## Routes

| Method | Path | Handler |
|--------|------|---------|
| POST | `/applicants/:id/notes` | Reads `notes` signal from request body, calls `applicantRepo.updateNotes`, returns empty SSE response |
| POST | `/grants/:id/notes` | Reads `notes` signal from request body, calls `grantRepo.updateNotes`, returns empty SSE response |

Signal reading uses `ServerSentEventGenerator.readSignals` (consistent with existing `handleCreate`/`handleUpdate` handlers).

## UI

### Applicant Panel

A `<textarea>` added to the Details tab below the email field. Bound to a `notes` Datastar signal initialised with the current notes value. Auto-saves on blur via `data-on-blur="@post('/applicants/${id}/notes')"`.

### Grant Panel

A notes `<textarea>` appended at the bottom of the grant panel, rendered for all grant statuses. Same auto-save-on-blur pattern: `data-on-blur="@post('/grants/${id}/notes')"`.

### Shared Pattern

Both textareas use:
- `data-signals="{notes: '<escaped-current-value>'}"` scoped to the notes section
- `data-bind-notes` on the textarea
- `data-on-blur="@post('...')"` to trigger save

## What Is Not Included

- Notes history / audit trail (informal scratch space only)
- Per-note authorship
- Notes on other entities (applications, volunteers)
- Character limits
