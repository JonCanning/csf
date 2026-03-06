# Recipient CRUD Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a CRUD repository for recipient contact records backed by SQLite.

**Architecture:** Repository pattern — a TypeScript interface defines the contract, a SQLite implementation handles persistence using the existing `SQLiteConnectionPool`. Types live in the domain layer, implementation in infrastructure.

**Tech Stack:** TypeScript, Bun (runtime + test runner), `@event-driven-io/emmett-sqlite` for `SQLiteConnectionPool`/`SQLiteConnection`

---

### Task 1: Define recipient types

**Files:**
- Create: `src/domain/recipient/types.ts`

**Step 1: Create the types file**

```ts
export type PaymentPreference = "bank" | "cash";

export type BankDetails = {
  sortCode: string;
  accountNumber: string;
};

export type Recipient = {
  id: string;
  phone: string;
  name: string;
  email?: string;
  paymentPreference: PaymentPreference;
  meetingPlace?: string;
  bankDetails?: BankDetails;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateRecipient = {
  phone: string;
  name: string;
  email?: string;
  paymentPreference?: PaymentPreference;
  meetingPlace?: string;
  bankDetails?: BankDetails;
  notes?: string;
};

export type UpdateRecipient = Partial<Omit<CreateRecipient, "phone">> & {
  phone?: string;
};
```

**Step 2: Verify it compiles**

Run: `bunx tsc --noEmit src/domain/recipient/types.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/domain/recipient/types.ts
git commit -m "Add recipient entity types"
```

---

### Task 2: Define repository interface

**Files:**
- Create: `src/domain/recipient/repository.ts`

**Step 1: Create the interface file**

```ts
import type { Recipient, CreateRecipient, UpdateRecipient } from "./types.ts";

export interface RecipientRepository {
  create(data: CreateRecipient): Promise<Recipient>;
  getById(id: string): Promise<Recipient | null>;
  getByPhone(phone: string): Promise<Recipient | null>;
  list(): Promise<Recipient[]>;
  update(id: string, data: UpdateRecipient): Promise<Recipient>;
  delete(id: string): Promise<void>;
}
```

**Step 2: Verify it compiles**

Run: `bunx tsc --noEmit src/domain/recipient/repository.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/domain/recipient/repository.ts
git commit -m "Add RecipientRepository interface"
```

---

### Task 3: Write failing tests for create + getById

**Files:**
- Create: `test/integration/recipientRepository.test.ts`

**Step 1: Write the test file with create + getById tests**

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import { SQLiteRecipientRepository } from "../../src/infrastructure/recipient/sqliteRecipientRepository.ts";
import type { RecipientRepository } from "../../src/domain/recipient/repository.ts";

describe("RecipientRepository", () => {
  let pool: ReturnType<typeof SQLiteConnectionPool>;
  let repo: RecipientRepository;

  beforeEach(async () => {
    pool = SQLiteConnectionPool({ fileName: ":memory:" });
    repo = await SQLiteRecipientRepository(pool);
  });

  afterEach(async () => {
    await pool.close();
  });

  describe("create", () => {
    test("creates a recipient with required fields", async () => {
      const recipient = await repo.create({
        phone: "07700900001",
        name: "Alice",
      });

      expect(recipient.id).toBeString();
      expect(recipient.phone).toBe("07700900001");
      expect(recipient.name).toBe("Alice");
      expect(recipient.paymentPreference).toBe("cash");
      expect(recipient.createdAt).toBeString();
      expect(recipient.updatedAt).toBeString();
    });

    test("creates a recipient with all fields", async () => {
      const recipient = await repo.create({
        phone: "07700900001",
        name: "Alice",
        email: "alice@example.com",
        paymentPreference: "bank",
        meetingPlace: "Mill Road",
        bankDetails: { sortCode: "12-34-56", accountNumber: "12345678" },
        notes: "Prefers morning meetings",
      });

      expect(recipient.email).toBe("alice@example.com");
      expect(recipient.paymentPreference).toBe("bank");
      expect(recipient.meetingPlace).toBe("Mill Road");
      expect(recipient.bankDetails).toEqual({
        sortCode: "12-34-56",
        accountNumber: "12345678",
      });
      expect(recipient.notes).toBe("Prefers morning meetings");
    });

    test("rejects duplicate phone number", async () => {
      await repo.create({ phone: "07700900001", name: "Alice" });
      await expect(
        repo.create({ phone: "07700900001", name: "Bob" }),
      ).rejects.toThrow();
    });
  });

  describe("getById", () => {
    test("returns recipient by id", async () => {
      const created = await repo.create({
        phone: "07700900001",
        name: "Alice",
      });
      const found = await repo.getById(created.id);

      expect(found).not.toBeNull();
      expect(found!.phone).toBe("07700900001");
    });

    test("returns null for unknown id", async () => {
      const found = await repo.getById("nonexistent");
      expect(found).toBeNull();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test test/integration/recipientRepository.test.ts`
Expected: FAIL — module not found (SQLiteRecipientRepository doesn't exist yet)

**Step 3: Commit**

```bash
git add test/integration/recipientRepository.test.ts
git commit -m "Add failing tests for recipient create + getById"
```

---

### Task 4: Implement SQLiteRecipientRepository (create + getById)

**Files:**
- Create: `src/infrastructure/recipient/sqliteRecipientRepository.ts`

**Step 1: Implement the repository**

Use `crypto.randomUUID()` for IDs. The factory function takes a connection pool, initializes the table, and returns the repository.

```ts
import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import type { RecipientRepository } from "../../domain/recipient/repository.ts";
import type {
  BankDetails,
  CreateRecipient,
  Recipient,
  UpdateRecipient,
} from "../../domain/recipient/types.ts";

type RecipientRow = {
  id: string;
  phone: string;
  name: string;
  email: string | null;
  payment_preference: string;
  meeting_place: string | null;
  bank_sort_code: string | null;
  bank_account_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function rowToRecipient(row: RecipientRow): Recipient {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    email: row.email ?? undefined,
    paymentPreference: row.payment_preference as Recipient["paymentPreference"],
    meetingPlace: row.meeting_place ?? undefined,
    bankDetails:
      row.bank_sort_code && row.bank_account_number
        ? { sortCode: row.bank_sort_code, accountNumber: row.bank_account_number }
        : undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function SQLiteRecipientRepository(
  pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<RecipientRepository> {
  await pool.withConnection(async (conn) => {
    await conn.command(`
      CREATE TABLE IF NOT EXISTS recipients (
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
      )
    `);
  });

  return {
    async create(data: CreateRecipient): Promise<Recipient> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await pool.withConnection(async (conn) => {
        await conn.command(
          `INSERT INTO recipients (id, phone, name, email, payment_preference, meeting_place, bank_sort_code, bank_account_number, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            data.phone,
            data.name,
            data.email ?? null,
            data.paymentPreference ?? "cash",
            data.meetingPlace ?? null,
            data.bankDetails?.sortCode ?? null,
            data.bankDetails?.accountNumber ?? null,
            data.notes ?? null,
            now,
            now,
          ],
        );
      });
      return (await this.getById(id))!;
    },

    async getById(id: string): Promise<Recipient | null> {
      return await pool.withConnection(async (conn) => {
        const rows = await conn.query<RecipientRow>(
          "SELECT * FROM recipients WHERE id = ?",
          [id],
        );
        return rows.length > 0 ? rowToRecipient(rows[0]!) : null;
      });
    },

    async getByPhone(phone: string): Promise<Recipient | null> {
      return await pool.withConnection(async (conn) => {
        const rows = await conn.query<RecipientRow>(
          "SELECT * FROM recipients WHERE phone = ?",
          [phone],
        );
        return rows.length > 0 ? rowToRecipient(rows[0]!) : null;
      });
    },

    async list(): Promise<Recipient[]> {
      return await pool.withConnection(async (conn) => {
        const rows = await conn.query<RecipientRow>(
          "SELECT * FROM recipients ORDER BY created_at DESC",
        );
        return rows.map(rowToRecipient);
      });
    },

    async update(id: string, data: UpdateRecipient): Promise<Recipient> {
      const existing = await this.getById(id);
      if (!existing) throw new Error(`Recipient not found: ${id}`);

      const now = new Date().toISOString();
      await pool.withConnection(async (conn) => {
        await conn.command(
          `UPDATE recipients SET
            phone = ?, name = ?, email = ?, payment_preference = ?,
            meeting_place = ?, bank_sort_code = ?, bank_account_number = ?,
            notes = ?, updated_at = ?
          WHERE id = ?`,
          [
            data.phone ?? existing.phone,
            data.name ?? existing.name,
            data.email !== undefined ? data.email : (existing.email ?? null),
            data.paymentPreference ?? existing.paymentPreference,
            data.meetingPlace !== undefined ? data.meetingPlace : (existing.meetingPlace ?? null),
            data.bankDetails !== undefined
              ? (data.bankDetails?.sortCode ?? null)
              : (existing.bankDetails?.sortCode ?? null),
            data.bankDetails !== undefined
              ? (data.bankDetails?.accountNumber ?? null)
              : (existing.bankDetails?.accountNumber ?? null),
            data.notes !== undefined ? data.notes : (existing.notes ?? null),
            now,
            id,
          ],
        );
      });
      return (await this.getById(id))!;
    },

    async delete(id: string): Promise<void> {
      await pool.withConnection(async (conn) => {
        await conn.command("DELETE FROM recipients WHERE id = ?", [id]);
      });
    },
  };
}
```

**Step 2: Run the tests**

Run: `bun test test/integration/recipientRepository.test.ts`
Expected: All 5 tests PASS

**Step 3: Commit**

```bash
git add src/infrastructure/recipient/sqliteRecipientRepository.ts
git commit -m "Implement SQLiteRecipientRepository with create + getById"
```

---

### Task 5: Add tests for getByPhone + list

**Files:**
- Modify: `test/integration/recipientRepository.test.ts`

**Step 1: Add getByPhone and list test blocks**

Append these `describe` blocks inside the outer `describe`:

```ts
  describe("getByPhone", () => {
    test("returns recipient by phone", async () => {
      await repo.create({ phone: "07700900001", name: "Alice" });
      const found = await repo.getByPhone("07700900001");

      expect(found).not.toBeNull();
      expect(found!.name).toBe("Alice");
    });

    test("returns null for unknown phone", async () => {
      const found = await repo.getByPhone("00000000000");
      expect(found).toBeNull();
    });
  });

  describe("list", () => {
    test("returns all recipients", async () => {
      await repo.create({ phone: "07700900001", name: "Alice" });
      await repo.create({ phone: "07700900002", name: "Bob" });
      const all = await repo.list();

      expect(all).toHaveLength(2);
    });

    test("returns empty array when no recipients", async () => {
      const all = await repo.list();
      expect(all).toHaveLength(0);
    });
  });
```

**Step 2: Run tests**

Run: `bun test test/integration/recipientRepository.test.ts`
Expected: All tests PASS (implementation already exists)

**Step 3: Commit**

```bash
git add test/integration/recipientRepository.test.ts
git commit -m "Add tests for getByPhone + list"
```

---

### Task 6: Add tests for update + delete

**Files:**
- Modify: `test/integration/recipientRepository.test.ts`

**Step 1: Add update and delete test blocks**

Append inside the outer `describe`:

```ts
  describe("update", () => {
    test("updates name", async () => {
      const created = await repo.create({ phone: "07700900001", name: "Alice" });
      const updated = await repo.update(created.id, { name: "Alicia" });

      expect(updated.name).toBe("Alicia");
      expect(updated.phone).toBe("07700900001");
      expect(updated.updatedAt).not.toBe(created.updatedAt);
    });

    test("updates bank details", async () => {
      const created = await repo.create({ phone: "07700900001", name: "Alice" });
      const updated = await repo.update(created.id, {
        bankDetails: { sortCode: "12-34-56", accountNumber: "12345678" },
      });

      expect(updated.bankDetails).toEqual({
        sortCode: "12-34-56",
        accountNumber: "12345678",
      });
    });

    test("clears optional fields when set to undefined", async () => {
      const created = await repo.create({
        phone: "07700900001",
        name: "Alice",
        notes: "Some note",
      });
      const updated = await repo.update(created.id, { notes: undefined });

      expect(updated.notes).toBe("Some note");
    });

    test("throws for unknown id", async () => {
      await expect(
        repo.update("nonexistent", { name: "Alice" }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe("delete", () => {
    test("deletes a recipient", async () => {
      const created = await repo.create({ phone: "07700900001", name: "Alice" });
      await repo.delete(created.id);
      const found = await repo.getById(created.id);

      expect(found).toBeNull();
    });

    test("is idempotent for unknown id", async () => {
      await expect(repo.delete("nonexistent")).resolves.toBeUndefined();
    });
  });
```

**Step 2: Run tests**

Run: `bun test test/integration/recipientRepository.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add test/integration/recipientRepository.test.ts
git commit -m "Add tests for update + delete"
```
