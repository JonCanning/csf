# Recipient CRUD Design

## Summary

Standalone contact directory for grant recipients, decoupled from the event-sourced application cycle. SQLite-backed repository pattern.

## Recipient Entity

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string (UUID) | auto | Primary key |
| phone | string | yes | Unique constraint |
| name | string | yes | |
| email | string | no | |
| paymentPreference | "bank" \| "cash" | yes | Default: "cash" |
| meetingPlace | string | no | |
| bankDetails | { sortCode, accountNumber } | no | Stored as two columns |
| notes | string | no | |
| createdAt | string (ISO) | auto | |
| updatedAt | string (ISO) | auto | |

## Repository Interface

- `create(data: CreateRecipient): Promise<Recipient>`
- `getById(id: string): Promise<Recipient | null>`
- `getByPhone(phone: string): Promise<Recipient | null>`
- `list(): Promise<Recipient[]>`
- `update(id: string, data: UpdateRecipient): Promise<Recipient>`
- `delete(id: string): Promise<void>`

## SQLite Schema

```sql
CREATE TABLE recipients (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  payment_preference TEXT NOT NULL DEFAULT 'cash',
  meeting_place TEXT,
  bank_sort_code TEXT,
  bank_account_number TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## File Locations

- `src/domain/recipient/types.ts` — types
- `src/domain/recipient/repository.ts` — interface
- `src/infrastructure/recipient/sqliteRecipientRepository.ts` — implementation
- `test/integration/recipientRepository.test.ts` — tests

## Integration Notes

The `known_applicants` projection remains separate for identity resolution. The `recipients` table is the canonical contact directory. Future refactor could have `resolveIdentity` query `recipients` instead.
