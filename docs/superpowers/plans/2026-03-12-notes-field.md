# Notes Field Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a freeform `notes` text field to applicants and grants, editable inline in their detail panels.

**Architecture:** Notes are stored directly in the `applicants` and `grants` SQLite projection tables as a `notes TEXT` column. Updates bypass the event store entirely — a direct `UPDATE` query via a new `updateNotes` method on each repository. The UI uses a Datastar textarea that auto-saves on blur.

**Tech Stack:** TypeScript, Bun, SQLite (via `@event-driven-io/emmett-sqlite`), Datastar (SSE signals), `bun:test`

**Spec:** `docs/superpowers/specs/2026-03-12-notes-field-design.md`

---

## File Map

| File | Change |
|------|--------|
| `src/domain/applicant/types.ts` | Add `notes?: string` to `Applicant` |
| `src/domain/applicant/repository.ts` | Add `updateNotes` to `ApplicantRepository` |
| `src/infrastructure/applicant/sqliteApplicantRepository.ts` | Migration, `ApplicantRow.notes`, mapping, `updateNotes` |
| `src/domain/grant/repository.ts` | Add `notes: string \| null` to `GrantRow`, `updateNotes` to `GrantRepository` |
| `src/infrastructure/grant/sqliteGrantRepository.ts` | `DbRow.notes`, mapping in `rowToGrant` |
| `src/infrastructure/projections/grant.ts` | Migration `ALTER TABLE grants ADD COLUMN notes TEXT` |
| `src/web/routes/applicants-admin.ts` | Add `handleUpdateNotes` |
| `src/web/routes/grants.ts` | Add `handleUpdateNotes` |
| `src/web/server.ts` | Wire `POST /applicants/:id/notes` and `POST /grants/:id/notes` |
| `src/web/pages/applicantPanel.ts` | Notes textarea in `editPanel` details tab |
| `src/web/pages/grantPanel.ts` | Notes section at bottom, `escapeSignalValue` helper |
| `test/integration/applicantRepository.test.ts` | Add `updateNotes` test |
| `test/integration/grantRepository.test.ts` | Add `updateNotes` test |
| `test/integration/applicantAdminRoutes.test.ts` | Add notes route test |
| `test/integration/grantRoutes.test.ts` | **Create** — notes route test for grants |
| `test/unit/applicantPanel.test.ts` | Add notes textarea tests |

---

## Chunk 1: Data Layer

### Task 1: Add `notes` to applicant types and interface

**Files:**
- Modify: `src/domain/applicant/types.ts`
- Modify: `src/domain/applicant/repository.ts`

- [ ] **Step 1: Add `notes?: string` to `Applicant` type in `types.ts`**

In `src/domain/applicant/types.ts`, add `notes?: string` to the `Applicant` type:

```ts
export type Applicant = {
  id: string;
  phone: string;
  name: string;
  email?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 2: Add `updateNotes` to `ApplicantRepository` interface**

In `src/domain/applicant/repository.ts`, add the method:

```ts
import type { Applicant } from "./types.ts";

export interface ApplicantRepository {
  getById(id: string): Promise<Applicant | null>;
  getByPhone(phone: string): Promise<Applicant[]>;
  getByPhoneAndName(phone: string, name: string): Promise<Applicant | null>;
  list(): Promise<Applicant[]>;
  updateNotes(id: string, notes: string): Promise<void>;
}
```

- [ ] **Step 3: Write a failing test for `updateNotes` in applicant repository**

Add to `test/integration/applicantRepository.test.ts`:

```ts
describe("updateNotes", () => {
  test("persists notes on the applicant", async () => {
    await createApplicant({ phone: "07700900001", name: "Alice" }, env.eventStore);
    const applicant = await repo.getByPhoneAndName("07700900001", "Alice");
    expect(applicant).not.toBeNull();

    await repo.updateNotes(applicant!.id, "Needs follow-up");

    const updated = await repo.getById(applicant!.id);
    expect(updated?.notes).toBe("Needs follow-up");
  });

  test("clears notes when empty string provided", async () => {
    await createApplicant({ phone: "07700900002", name: "Bob" }, env.eventStore);
    const applicant = await repo.getByPhoneAndName("07700900002", "Bob");
    await repo.updateNotes(applicant!.id, "Something");
    await repo.updateNotes(applicant!.id, "");
    const updated = await repo.getById(applicant!.id);
    expect(updated?.notes).toBeFalsy();
  });
});
```

- [ ] **Step 4: Run test to confirm it fails**

```bash
bun test test/integration/applicantRepository.test.ts
```

Expected: fails with `updateNotes is not a function` (or type error).

---

### Task 2: Implement `updateNotes` in `SQLiteApplicantRepository`

**Files:**
- Modify: `src/infrastructure/applicant/sqliteApplicantRepository.ts`

- [ ] **Step 1: Add `notes` column migration, update `ApplicantRow` and `rowToApplicant`**

Replace the content of `sqliteApplicantRepository.ts`:

```ts
import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import type { ApplicantRepository } from "../../domain/applicant/repository.ts";
import type { Applicant } from "../../domain/applicant/types.ts";

type ApplicantRow = {
  id: string;
  phone: string;
  name: string;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function rowToApplicant(row: ApplicantRow): Applicant {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    email: row.email ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function SQLiteApplicantRepository(
  pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<ApplicantRepository> {
  await pool.withConnection(async (conn) => {
    await conn.command(`
      CREATE TABLE IF NOT EXISTS applicants (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    try {
      await conn.command("ALTER TABLE applicants ADD COLUMN notes TEXT");
    } catch (e) {
      if (!(e instanceof Error && e.message.includes("duplicate column"))) throw e;
    }
  });

  return {
    async getById(id: string): Promise<Applicant | null> {
      return await pool.withConnection(async (conn) => {
        const rows = await conn.query<ApplicantRow>(
          "SELECT * FROM applicants WHERE id = ?",
          [id],
        );
        return rows.length > 0 ? rowToApplicant(rows[0]!) : null;
      });
    },

    async getByPhone(phone: string): Promise<Applicant[]> {
      return await pool.withConnection(async (conn) => {
        const rows = await conn.query<ApplicantRow>(
          "SELECT * FROM applicants WHERE phone = ?",
          [phone],
        );
        return rows.map(rowToApplicant);
      });
    },

    async getByPhoneAndName(phone: string, name: string): Promise<Applicant | null> {
      return await pool.withConnection(async (conn) => {
        const rows = await conn.query<ApplicantRow>(
          "SELECT * FROM applicants WHERE phone = ? AND name = ?",
          [phone, name],
        );
        return rows.length > 0 ? rowToApplicant(rows[0]!) : null;
      });
    },

    async list(): Promise<Applicant[]> {
      return await pool.withConnection(async (conn) => {
        const rows = await conn.query<ApplicantRow>(
          "SELECT * FROM applicants ORDER BY created_at DESC",
        );
        return rows.map(rowToApplicant);
      });
    },

    async updateNotes(id: string, notes: string): Promise<void> {
      await pool.withConnection(async (conn) => {
        await conn.command(
          "UPDATE applicants SET notes = ? WHERE id = ?",
          [notes || null, id],
        );
      });
    },
  };
}
```

- [ ] **Step 2: Run tests to confirm they pass**

```bash
bun test test/integration/applicantRepository.test.ts
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/domain/applicant/types.ts src/domain/applicant/repository.ts src/infrastructure/applicant/sqliteApplicantRepository.ts test/integration/applicantRepository.test.ts
git commit -m "feat: add notes field to applicant type and repository"
```

---

### Task 3: Add `notes` to grant types, interface, and projection migration

**Files:**
- Modify: `src/domain/grant/repository.ts`
- Modify: `src/infrastructure/projections/grant.ts`

- [ ] **Step 1: Add `notes` to `GrantRow` and `updateNotes` to `GrantRepository`**

In `src/domain/grant/repository.ts`:

```ts
export type GrantRow = {
  id: string;
  applicationId: string;
  applicantId: string;
  monthCycle: string;
  rank: number;
  status: string;
  paymentPreference: string;
  sortCode: string | null;
  accountNumber: string | null;
  proofOfAddressRef: string | null;
  volunteerId: string | null;
  volunteerName: string | null;
  applicantName: string | null;
  applicantPhone: string | null;
  poaAttempts: number;
  amount: number | null;
  paymentMethod: string | null;
  paidBy: string | null;
  paidAt: string | null;
  expenseReference: string | null;
  reimbursedAt: string | null;
  releasedReason: string | null;
  releasedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export interface GrantRepository {
  getById(id: string): Promise<GrantRow | null>;
  getByApplicationId(applicationId: string): Promise<GrantRow | null>;
  listByMonth(monthCycle: string): Promise<GrantRow[]>;
  listDistinctMonths(): Promise<string[]>;
  updateNotes(id: string, notes: string): Promise<void>;
}
```

- [ ] **Step 2: Add `notes` column to `grants` table CREATE and migration in projection `init`**

In `src/infrastructure/projections/grant.ts`, update `init`:

```ts
init: async ({ context: { connection } }) => {
  await connection.command(`
    CREATE TABLE IF NOT EXISTS grants (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      applicant_id TEXT NOT NULL,
      month_cycle TEXT NOT NULL,
      rank INTEGER NOT NULL,
      status TEXT NOT NULL,
      payment_preference TEXT NOT NULL,
      sort_code TEXT,
      account_number TEXT,
      poa_ref TEXT,
      volunteer_id TEXT,
      poa_attempts INTEGER NOT NULL DEFAULT 0,
      amount INTEGER,
      payment_method TEXT,
      paid_by TEXT,
      paid_at TEXT,
      expense_reference TEXT,
      reimbursed_at TEXT,
      released_reason TEXT,
      released_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  try {
    await connection.command("ALTER TABLE grants ADD COLUMN notes TEXT");
  } catch (e) {
    if (!(e instanceof Error && e.message.includes("duplicate column"))) throw e;
  }
},
```

- [ ] **Step 3: Write a failing test for `updateNotes` in grant repository**

Add to `test/integration/grantRepository.test.ts`:

```ts
describe("updateNotes", () => {
  test("persists notes on the grant", async () => {
    await createGrant("g-notes");

    await repo.updateNotes("g-notes", "Call applicant Tuesday");

    const grant = await repo.getById("g-notes");
    expect(grant?.notes).toBe("Call applicant Tuesday");
  });

  test("clears notes when empty string provided", async () => {
    await createGrant("g-notes-clear");
    await repo.updateNotes("g-notes-clear", "Initial note");
    await repo.updateNotes("g-notes-clear", "");
    const grant = await repo.getById("g-notes-clear");
    expect(grant?.notes).toBeFalsy();
  });
});
```

- [ ] **Step 4: Run test to confirm it fails**

```bash
bun test test/integration/grantRepository.test.ts
```

Expected: fails with `updateNotes is not a function`.

---

### Task 4: Implement `updateNotes` in `SQLiteGrantRepository`

**Files:**
- Modify: `src/infrastructure/grant/sqliteGrantRepository.ts`

- [ ] **Step 1: Replace `sqliteGrantRepository.ts` with the full updated version**

Replace the entire file with:

```ts
import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import type {
  GrantRepository,
  GrantRow,
} from "../../domain/grant/repository.ts";

type DbRow = {
  id: string;
  application_id: string;
  applicant_id: string;
  month_cycle: string;
  rank: number;
  status: string;
  payment_preference: string;
  sort_code: string | null;
  account_number: string | null;
  poa_ref: string | null;
  volunteer_id: string | null;
  volunteer_name: string | null;
  applicant_name: string | null;
  applicant_phone: string | null;
  poa_attempts: number;
  amount: number | null;
  payment_method: string | null;
  paid_by: string | null;
  paid_at: string | null;
  expense_reference: string | null;
  reimbursed_at: string | null;
  released_reason: string | null;
  released_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function isNoSuchTable(err: unknown): boolean {
  return err instanceof Error && err.message.includes("no such table");
}

function rowToGrant(row: DbRow): GrantRow {
  return {
    id: row.id,
    applicationId: row.application_id,
    applicantId: row.applicant_id,
    monthCycle: row.month_cycle,
    rank: row.rank,
    status: row.status,
    paymentPreference: row.payment_preference,
    sortCode: row.sort_code,
    accountNumber: row.account_number,
    proofOfAddressRef: row.poa_ref,
    volunteerId: row.volunteer_id,
    volunteerName: row.volunteer_name,
    applicantName: row.applicant_name,
    applicantPhone: row.applicant_phone,
    poaAttempts: row.poa_attempts,
    amount: row.amount,
    paymentMethod: row.payment_method,
    paidBy: row.paid_by,
    paidAt: row.paid_at,
    expenseReference: row.expense_reference,
    reimbursedAt: row.reimbursed_at,
    releasedReason: row.released_reason,
    releasedAt: row.released_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_GRANTS = `
  SELECT g.*,
    v.name AS volunteer_name,
    a.name AS applicant_name,
    a.phone AS applicant_phone
  FROM grants g
  LEFT JOIN volunteers v ON g.volunteer_id = v.id
  LEFT JOIN applicants a ON g.applicant_id = a.id
`;

export function SQLiteGrantRepository(
  pool: ReturnType<typeof SQLiteConnectionPool>,
): GrantRepository {
  return {
    async getById(id: string): Promise<GrantRow | null> {
      try {
        return await pool.withConnection(async (conn) => {
          const rows = await conn.query<DbRow>(
            `${SELECT_GRANTS} WHERE g.id = ?`,
            [id],
          );
          const first = rows[0];
          return first ? rowToGrant(first) : null;
        });
      } catch (err) {
        if (isNoSuchTable(err)) return null;
        throw err;
      }
    },

    async getByApplicationId(applicationId: string): Promise<GrantRow | null> {
      try {
        return await pool.withConnection(async (conn) => {
          const rows = await conn.query<DbRow>(
            `${SELECT_GRANTS} WHERE g.application_id = ? LIMIT 1`,
            [applicationId],
          );
          return rows.length > 0 ? rowToGrant(rows[0]!) : null;
        });
      } catch (err) {
        if (isNoSuchTable(err)) return null;
        throw err;
      }
    },

    async listByMonth(monthCycle: string): Promise<GrantRow[]> {
      try {
        return await pool.withConnection(async (conn) => {
          const rows = await conn.query<DbRow>(
            `${SELECT_GRANTS} WHERE g.month_cycle = ? ORDER BY g.rank ASC`,
            [monthCycle],
          );
          return rows.map(rowToGrant);
        });
      } catch (err) {
        if (isNoSuchTable(err)) return [];
        throw err;
      }
    },

    async listDistinctMonths(): Promise<string[]> {
      try {
        return await pool.withConnection(async (conn) => {
          const rows = await conn.query<{ month_cycle: string }>(
            "SELECT DISTINCT month_cycle FROM grants ORDER BY month_cycle DESC",
          );
          return rows.map((r) => r.month_cycle);
        });
      } catch (err) {
        if (isNoSuchTable(err)) return [];
        throw err;
      }
    },

    async updateNotes(id: string, notes: string): Promise<void> {
      await pool.withConnection(async (conn) => {
        await conn.command(
          "UPDATE grants SET notes = ? WHERE id = ?",
          [notes || null, id],
        );
      });
    },
  };
}
```

- [ ] **Step 2: Run grant repository tests**

```bash
bun test test/integration/grantRepository.test.ts
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/domain/grant/repository.ts src/infrastructure/grant/sqliteGrantRepository.ts src/infrastructure/projections/grant.ts test/integration/grantRepository.test.ts
git commit -m "feat: add notes field to grant type, repository, and projection"
```

---

## Chunk 2: Routes and Server Wiring

### Task 5: Add notes route to applicant routes

**Files:**
- Modify: `src/web/routes/applicants-admin.ts`
- Modify: `src/web/server.ts`

- [ ] **Step 1: Write a failing test for the notes route**

Add to `test/integration/applicantAdminRoutes.test.ts`:

```ts
describe("handleUpdateNotes", () => {
  test("saves notes and returns SSE", async () => {
    const { id } = await createApplicant(
      { phone: "07700900010", name: "Notes Test" },
      env.eventStore,
    );

    const req = new Request(`http://localhost/applicants/${id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "important" }),
    });

    const res = await routes.handleUpdateNotes(id, req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const applicant = await env.applicantRepo.getById(id);
    expect(applicant?.notes).toBe("important");
  });

  test("returns 400 for malformed request body", async () => {
    const req = new Request("http://localhost/applicants/x/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await routes.handleUpdateNotes("x", req);
    expect(res.status).toBe(400);
  });
});
```

You'll also need to import `createApplicant` at the top of the test file:
```ts
import { createApplicant } from "../../src/domain/applicant/commandHandlers.ts";
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
bun test test/integration/applicantAdminRoutes.test.ts
```

Expected: fails with `routes.handleUpdateNotes is not a function`.

- [ ] **Step 3: Add `handleUpdateNotes` to `createApplicantRoutes`**

In `src/web/routes/applicants-admin.ts`, add to the returned object (after `history`):

```ts
async handleUpdateNotes(id: string, req: Request): Promise<Response> {
  const result = await ServerSentEventGenerator.readSignals(req);
  if (!result.success) {
    return new Response(result.error, { status: 400 });
  }
  const notes = String(result.signals.notes ?? "");
  await applicantRepo.updateNotes(id, notes);
  return sseResponse();
},
```

- [ ] **Step 4: Run tests**

```bash
bun test test/integration/applicantAdminRoutes.test.ts
```

Expected: all pass.

- [ ] **Step 5: Wire the route in `server.ts`**

In `src/web/server.ts`, add a new match block in the `fetch` handler. Place it **before** the `idMatch` block (around line 500), so it takes priority:

```ts
const applicantNotesMatch = url.pathname.match(/^\/applicants\/([^/]+)\/notes$/);
if (applicantNotesMatch?.[1] && req.method === "POST") {
  return applicantRoutes.handleUpdateNotes(applicantNotesMatch[1], req);
}
```

- [ ] **Step 6: Run all tests**

```bash
bun test
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/web/routes/applicants-admin.ts src/web/server.ts test/integration/applicantAdminRoutes.test.ts
git commit -m "feat: add notes route for applicants"
```

---

### Task 6: Add notes route to grant routes

**Files:**
- Modify: `src/web/routes/grants.ts`
- Modify: `src/web/server.ts`
- Create: `test/integration/grantRoutes.test.ts`

- [ ] **Step 1: Create grant routes test file**

Create `test/integration/grantRoutes.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import type { GrantEvent } from "../../src/domain/grant/types.ts";
import { SQLiteGrantRepository } from "../../src/infrastructure/grant/sqliteGrantRepository.ts";
import { DocumentStore } from "../../src/infrastructure/projections/documents.ts";
import { SQLiteVolunteerRepository } from "../../src/infrastructure/volunteer/sqliteVolunteerRepository.ts";
import { createGrantRoutes } from "../../src/web/routes/grants.ts";
import { createTestEnv, type TestEnv } from "./helpers/testEventStore.ts";

describe("grant routes", () => {
  let env: TestEnv;
  let routes: ReturnType<typeof createGrantRoutes>;

  beforeEach(async () => {
    env = await createTestEnv();
    const grantRepo = SQLiteGrantRepository(env.pool);
    const volunteerRepo = await SQLiteVolunteerRepository(env.pool);
    const docStore = DocumentStore(env.pool);
    await docStore.init();
    routes = createGrantRoutes(grantRepo, volunteerRepo, docStore, env.eventStore);

    // seed an applicant for the grant FK
    await env.pool.withConnection(async (conn) => {
      await conn.command(
        "INSERT OR IGNORE INTO applicants (id, phone, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        ["a1", "07700900001", "Alice", null, "2026-01-01", "2026-01-01"],
      );
    });
  });

  afterEach(async () => {
    await env.cleanup();
  });

  async function createGrant(id: string) {
    await env.eventStore.appendToStream<GrantEvent>(`grant-${id}`, [
      {
        type: "GrantCreated",
        data: {
          grantId: id,
          applicationId: `app-${id}`,
          applicantId: "a1",
          monthCycle: "2026-03",
          rank: 1,
          paymentPreference: "cash",
          createdAt: "2026-03-01T00:00:00.000Z",
        },
      },
    ]);
  }

  describe("handleUpdateNotes", () => {
    test("saves notes and returns SSE", async () => {
      await createGrant("g1");

      const req = new Request("http://localhost/grants/g1/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantnotes: "follow up Friday" }),
      });

      const res = await routes.handleUpdateNotes("g1", req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");

      // Verify persistence directly via repository
      const grant = await SQLiteGrantRepository(env.pool).getById("g1");
      expect(grant?.notes).toBe("follow up Friday");
    });

    test("returns 400 for malformed request body", async () => {
      const req = new Request("http://localhost/grants/x/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      });
      const res = await routes.handleUpdateNotes("x", req);
      expect(res.status).toBe(400);
    });
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
bun test test/integration/grantRoutes.test.ts
```

Expected: fails with `routes.handleUpdateNotes is not a function`.

- [ ] **Step 3: Add `handleUpdateNotes` to `createGrantRoutes`**

In `src/web/routes/grants.ts`, add to the returned object (after `serveDocument`):

```ts
async handleUpdateNotes(id: string, req: Request): Promise<Response> {
  const result = await ServerSentEventGenerator.readSignals(req);
  if (!result.success) {
    return new Response(result.error, { status: 400 });
  }
  const notes = String(result.signals.grantnotes ?? "");
  await grantRepo.updateNotes(id, notes);
  return sseResponse();
},
```

Update the import from `"../sse.ts"` — `ServerSentEventGenerator` is already exported from that file, just add it:

```ts
import { patchElements, ServerSentEventGenerator, sseResponse } from "../sse.ts";
```

- [ ] **Step 4: Run tests**

```bash
bun test test/integration/grantRoutes.test.ts
```

Expected: all pass.

- [ ] **Step 5: Wire the route in `server.ts`**

In `src/web/server.ts`, add a new match block in the `fetch` handler, **before** the `grantIdMatch` block (around line 440):

```ts
const grantNotesMatch = url.pathname.match(/^\/grants\/([^/]+)\/notes$/);
if (grantNotesMatch?.[1] && req.method === "POST") {
  return grantRoutes.handleUpdateNotes(grantNotesMatch[1], req);
}
```

- [ ] **Step 6: Run all tests**

```bash
bun test
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/web/routes/grants.ts src/web/server.ts test/integration/grantRoutes.test.ts
git commit -m "feat: add notes route for grants"
```

---

## Chunk 3: UI

### Task 7: Add notes textarea to applicant panel

**Files:**
- Modify: `src/web/pages/applicantPanel.ts`
- Modify: `test/unit/applicantPanel.test.ts`

- [ ] **Step 1: Write failing tests for the notes textarea**

Add to `test/unit/applicantPanel.test.ts` inside `describe("editPanel", ...)`:

```ts
test("renders notes textarea with data-bind-notes", () => {
  const html = editPanel(alice);
  expect(html).toContain("data-bind-notes");
});

test("pre-fills notes signal value", () => {
  const withNotes: Applicant = { ...alice, notes: "Call Wednesday" };
  const html = editPanel(withNotes);
  expect(html).toContain("Call Wednesday");
});

test("notes auto-saves on blur", () => {
  const html = editPanel(alice);
  expect(html).toContain(`/applicants/${alice.id}/notes`);
  expect(html).toContain("data-on-blur");
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bun test test/unit/applicantPanel.test.ts
```

Expected: the 3 new tests fail.

- [ ] **Step 3: Add notes section to `editPanel` in `applicantPanel.ts`**

In `src/web/pages/applicantPanel.ts`, update `editPanel`. Add the notes section inside the `data-show="$activeTab==='details'"` div, below the `applicantForm` call. Note: `escapeSignalValue` already exists in this file — no new import needed.

```ts
export function editPanel(r: Applicant): string {
  return panelWrapper(`
    <div data-signals="{activeTab: 'details', historyLoaded: false}">
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-heading font-bold text-xl text-bark">Edit Applicant</h2>
      <button class="btn btn-secondary" data-on-click="@get('/applicants/close')">Close</button>
    </div>
    <div class="flex gap-1 mb-4 border-b border-cream-200">
      <button type="button"
        class="tab"
        data-class-border-amber="$activeTab==='details'"
        data-class-text-amber="$activeTab==='details'"
        data-on-click="$activeTab='details'">Details</button>
      <button type="button"
        class="tab"
        data-class-border-amber="$activeTab==='history'"
        data-class-text-amber="$activeTab==='history'"
        data-on-click="$activeTab='history'; if(!$historyLoaded){$historyLoaded=true; @get('/applicants/${r.id}/history')}">History</button>
    </div>
    <div data-show="$activeTab==='details'">
    ${applicantForm({
      action: `/applicants/${r.id}`,
      method: "@put",
      submitLabel: "Save",
      name: r.name,
      phone: r.phone,
      email: r.email ?? "",
      deleteAction: `@delete('/applicants/${r.id}')`,
    })}
    <div class="mt-4" data-signals="{notes: '${escapeSignalValue(r.notes ?? "")}'}">
      <label class="label">Notes</label>
      <textarea class="input" rows="3" data-bind-notes
        data-on-blur="@post('/applicants/${r.id}/notes')"></textarea>
    </div>
    </div>
    <div data-show="$activeTab==='history'" style="display:none">
      <div id="history-content" class="py-8 text-center text-bark-muted text-sm">Loading...</div>
    </div>
    </div>
  `);
}
```

- [ ] **Step 4: Run tests**

```bash
bun test test/unit/applicantPanel.test.ts
```

Expected: all pass.

- [ ] **Step 5: Run full test suite**

```bash
bun test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/web/pages/applicantPanel.ts test/unit/applicantPanel.test.ts
git commit -m "feat: add notes textarea to applicant panel"
```

---

### Task 8: Add notes section to grant panel

**Files:**
- Modify: `src/web/pages/grantPanel.ts`

- [ ] **Step 1: Add `escapeSignalValue` helper and notes section to `grantPanel`**

In `src/web/pages/grantPanel.ts`:

1. Add `escapeSignalValue` function after the existing helper functions (e.g., after `formatStatus`):

```ts
function escapeSignalValue(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}
```

2. Update the `grantPanel` export to append the notes section after `actions`:

```ts
export function grantPanel(
  grant: GrantRow,
  volunteers: Volunteer[],
  hasDocument: boolean,
): string {
  // ... existing switch statement building `actions` ...

  return panelWrapper(`
    ${panelHeader(grant)}
    <dl>${commonFields(grant)}</dl>
    ${actions}
    <div class="mt-6 border-t border-cream-200 pt-4" data-signals="{grantnotes: '${escapeSignalValue(grant.notes ?? "")}'}">
      <label class="label">Notes</label>
      <textarea class="input" rows="3" data-bind-grantnotes
        data-on-blur="@post('/grants/${encodeURIComponent(grant.id)}/notes')"></textarea>
    </div>
  `);
}
```

- [ ] **Step 2: Run full test suite**

```bash
bun test
```

Expected: all pass.

- [ ] **Step 3: Lint and format**

```bash
bunx biome check --write
```

- [ ] **Step 4: Run tests again after formatting**

```bash
bun test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/web/pages/grantPanel.ts
git commit -m "feat: add notes section to grant panel"
```

---

## Final Verification

- [ ] **Run full test suite one last time**

```bash
bun test
```

Expected: all pass, no failures.
