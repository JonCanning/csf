# Application Form & Applications Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a public application form at `/apply` and an authenticated applications management view at `/applications` with flagged-application review.

**Architecture:** Public form uses plain HTML POST (no Datastar). Applications management page follows the recipients pattern — Datastar SSE table with slide-out panel. The applications projection is extended with `name` and `phone` columns (denormalized from `ApplicationSubmitted` event) so no joins are needed.

**Tech Stack:** Bun.serve routes, server-rendered HTML, Tailwind (cream/bark/amber palette), Datastar SSE for management view, SQLite projections.

---

### Task 1: Extend applications projection with name and phone

**Files:**
- Modify: `src/infrastructure/projections/applications.ts`
- Test: `test/integration/applicationsProjection.test.ts`

**Step 1: Update the existing projection test to verify name/phone are stored**

Add a test that submits an application and checks that the `applications` table row includes `name` and `phone` columns.

```ts
test("stores name and phone from ApplicationSubmitted", async () => {
  await eventStore.appendToStream("application-app-1", [
    {
      type: "ApplicationSubmitted",
      data: {
        applicationId: "app-1",
        applicantId: "applicant-07700900001",
        identity: { phone: "07700900001", name: "Alice" },
        paymentPreference: "bank",
        meetingDetails: { place: "Mill Road" },
        monthCycle: "2026-03",
        submittedAt: "2026-03-01T10:00:00Z",
      },
    },
  ]);

  const rows = await pool.withConnection(async (conn) =>
    conn.query<{ name: string; phone: string }>(
      "SELECT name, phone FROM applications WHERE id = ?",
      ["app-1"],
    ),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]!.name).toBe("Alice");
  expect(rows[0]!.phone).toBe("07700900001");
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/integration/applicationsProjection.test.ts`
Expected: FAIL — columns `name` and `phone` don't exist.

**Step 3: Add name and phone columns to the projection**

In `src/infrastructure/projections/applications.ts`:
- Add `name TEXT` and `phone TEXT` columns to the `CREATE TABLE` statement
- In the `ApplicationSubmitted` handler, insert `data.identity.name` and `data.identity.phone`

```ts
// init
await connection.command(`
  CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    applicant_id TEXT NOT NULL,
    month_cycle TEXT NOT NULL,
    status TEXT NOT NULL,
    rank INTEGER,
    payment_preference TEXT NOT NULL,
    name TEXT,
    phone TEXT,
    reject_reason TEXT,
    applied_at TEXT,
    accepted_at TEXT,
    selected_at TEXT,
    rejected_at TEXT
  )
`);

// ApplicationSubmitted handler
await connection.command(
  `INSERT OR IGNORE INTO applications (id, applicant_id, month_cycle, status, payment_preference, name, phone, applied_at)
   VALUES (?, ?, ?, 'applied', ?, ?, ?, ?)`,
  [
    data.applicationId,
    data.applicantId,
    data.monthCycle,
    data.paymentPreference,
    data.identity.name,
    data.identity.phone,
    data.submittedAt,
  ],
);
```

**Step 4: Run test to verify it passes**

Run: `bun test test/integration/applicationsProjection.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/infrastructure/projections/applications.ts test/integration/applicationsProjection.test.ts
git commit -m "feat: add name and phone columns to applications projection"
```

---

### Task 2: Create application repository

**Files:**
- Create: `src/domain/application/repository.ts`
- Create: `src/infrastructure/application/sqliteApplicationRepository.ts`
- Test: `test/integration/applicationRepository.test.ts`

**Step 1: Define the repository interface and Application read model type**

```ts
// src/domain/application/repository.ts
export type ApplicationRow = {
  id: string;
  applicantId: string;
  monthCycle: string;
  status: string;
  rank: number | null;
  paymentPreference: string;
  name: string | null;
  phone: string | null;
  rejectReason: string | null;
  appliedAt: string | null;
  acceptedAt: string | null;
  selectedAt: string | null;
  rejectedAt: string | null;
};

export interface ApplicationRepository {
  getById(id: string): Promise<ApplicationRow | null>;
  listByMonth(monthCycle: string): Promise<ApplicationRow[]>;
  listDistinctMonths(): Promise<string[]>;
}
```

**Step 2: Write failing test**

```ts
// test/integration/applicationRepository.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
  SQLiteConnectionPool,
  SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { SQLiteApplicationRepository } from "../../src/infrastructure/application/sqliteApplicationRepository.ts";
import type { ApplicationRepository } from "../../src/domain/application/repository.ts";

describe("SQLiteApplicationRepository", () => {
  let eventStore: SQLiteEventStore;
  let pool: ReturnType<typeof SQLiteConnectionPool>;
  let repo: ApplicationRepository;

  beforeEach(async () => {
    const es = createEventStore(":memory:");
    eventStore = es.store;
    pool = es.pool;
    repo = SQLiteApplicationRepository(pool);
  });

  afterEach(async () => {
    await pool.close();
  });

  async function seedApplication(id: string, monthCycle: string, name: string, phone: string) {
    await eventStore.appendToStream(`application-${id}`, [
      {
        type: "ApplicationSubmitted",
        data: {
          applicationId: id,
          applicantId: `applicant-${phone}`,
          identity: { phone, name },
          paymentPreference: "cash",
          meetingDetails: { place: "Mill Road" },
          monthCycle,
          submittedAt: "2026-03-01T10:00:00Z",
        },
      },
      {
        type: "ApplicationAccepted",
        data: {
          applicationId: id,
          applicantId: `applicant-${phone}`,
          monthCycle,
          acceptedAt: "2026-03-01T10:00:00Z",
        },
      },
    ]);
  }

  test("getById returns application", async () => {
    await seedApplication("app-1", "2026-03", "Alice", "07700900001");
    const app = await repo.getById("app-1");
    expect(app).not.toBeNull();
    expect(app!.name).toBe("Alice");
    expect(app!.status).toBe("accepted");
  });

  test("getById returns null for unknown id", async () => {
    const app = await repo.getById("nonexistent");
    expect(app).toBeNull();
  });

  test("listByMonth returns applications for given month", async () => {
    await seedApplication("app-1", "2026-03", "Alice", "07700900001");
    await seedApplication("app-2", "2026-03", "Bob", "07700900002");
    await seedApplication("app-3", "2026-04", "Charlie", "07700900003");

    const march = await repo.listByMonth("2026-03");
    expect(march).toHaveLength(2);

    const april = await repo.listByMonth("2026-04");
    expect(april).toHaveLength(1);
  });

  test("listDistinctMonths returns sorted month cycles", async () => {
    await seedApplication("app-1", "2026-03", "Alice", "07700900001");
    await seedApplication("app-2", "2026-04", "Bob", "07700900002");
    await seedApplication("app-3", "2026-03", "Charlie", "07700900003");

    const months = await repo.listDistinctMonths();
    expect(months).toEqual(["2026-04", "2026-03"]);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `bun test test/integration/applicationRepository.test.ts`
Expected: FAIL — module not found

**Step 4: Implement the repository**

```ts
// src/infrastructure/application/sqliteApplicationRepository.ts
import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import type {
  ApplicationRepository,
  ApplicationRow,
} from "../../domain/application/repository.ts";

type DbRow = {
  id: string;
  applicant_id: string;
  month_cycle: string;
  status: string;
  rank: number | null;
  payment_preference: string;
  name: string | null;
  phone: string | null;
  reject_reason: string | null;
  applied_at: string | null;
  accepted_at: string | null;
  selected_at: string | null;
  rejected_at: string | null;
};

function rowToApplication(row: DbRow): ApplicationRow {
  return {
    id: row.id,
    applicantId: row.applicant_id,
    monthCycle: row.month_cycle,
    status: row.status,
    rank: row.rank,
    paymentPreference: row.payment_preference,
    name: row.name,
    phone: row.phone,
    rejectReason: row.reject_reason,
    appliedAt: row.applied_at,
    acceptedAt: row.accepted_at,
    selectedAt: row.selected_at,
    rejectedAt: row.rejected_at,
  };
}

export function SQLiteApplicationRepository(
  pool: ReturnType<typeof SQLiteConnectionPool>,
): ApplicationRepository {
  return {
    async getById(id: string): Promise<ApplicationRow | null> {
      return pool.withConnection(async (conn) => {
        const rows = await conn.query<DbRow>(
          "SELECT * FROM applications WHERE id = ?",
          [id],
        );
        return rows.length > 0 ? rowToApplication(rows[0]!) : null;
      });
    },

    async listByMonth(monthCycle: string): Promise<ApplicationRow[]> {
      return pool.withConnection(async (conn) => {
        const rows = await conn.query<DbRow>(
          "SELECT * FROM applications WHERE month_cycle = ? ORDER BY applied_at DESC",
          [monthCycle],
        );
        return rows.map(rowToApplication);
      });
    },

    async listDistinctMonths(): Promise<string[]> {
      return pool.withConnection(async (conn) => {
        const rows = await conn.query<{ month_cycle: string }>(
          "SELECT DISTINCT month_cycle FROM applications ORDER BY month_cycle DESC",
        );
        return rows.map((r) => r.month_cycle);
      });
    },
  };
}
```

**Step 5: Run test to verify it passes**

Run: `bun test test/integration/applicationRepository.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/domain/application/repository.ts src/infrastructure/application/sqliteApplicationRepository.ts test/integration/applicationRepository.test.ts
git commit -m "feat: add application repository with month-based queries"
```

---

### Task 3: Build public application form page

**Files:**
- Create: `src/web/pages/apply.ts`
- Test: `test/unit/applyPage.test.ts`

**Step 1: Write test for the form page HTML**

```ts
// test/unit/applyPage.test.ts
import { describe, expect, test } from "bun:test";
import { applyPage, applyClosedPage, applyResultPage } from "../../src/web/pages/apply.ts";

describe("applyPage", () => {
  test("renders form with required fields", () => {
    const html = applyPage();
    expect(html).toContain('name="name"');
    expect(html).toContain('name="phone"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="meetingPlace"');
    expect(html).toContain('name="paymentPreference"');
    expect(html).toContain('action="/apply"');
    expect(html).toContain('method="POST"');
  });

  test("does not include Datastar script", () => {
    const html = applyPage();
    expect(html).not.toContain("datastar");
  });
});

describe("applyClosedPage", () => {
  test("shows window closed message", () => {
    const html = applyClosedPage();
    expect(html).toContain("closed");
  });
});

describe("applyResultPage", () => {
  test("accepted status shows lottery pool message", () => {
    const html = applyResultPage("accepted");
    expect(html).toContain("lottery pool");
  });

  test("flagged status shows volunteer contact message", () => {
    const html = applyResultPage("flagged");
    expect(html).toContain("volunteer will contact");
  });

  test("rejected with window_closed reason", () => {
    const html = applyResultPage("rejected", "window_closed");
    expect(html).toContain("closed");
  });

  test("rejected with cooldown reason", () => {
    const html = applyResultPage("rejected", "cooldown");
    expect(html).toContain("recently");
  });

  test("rejected with duplicate reason", () => {
    const html = applyResultPage("rejected", "duplicate");
    expect(html).toContain("already applied");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/applyPage.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the apply pages**

Create `src/web/pages/apply.ts` with three exported functions:
- `applyPage()` — the form (standalone HTML, no layout wrapper with Datastar)
- `applyClosedPage()` — static "window closed" page
- `applyResultPage(status, reason?)` — result page after submission

The page uses the same Tailwind palette but a standalone layout without Datastar JS. The form uses a simple `<script>` to toggle bank fields based on payment preference radio.

```ts
// src/web/pages/apply.ts

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function publicLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CSF - ${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Source+Serif+4:wght@400;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles/app.css">
  <style>
    body { background-image: url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M20 20.5c0-.3.2-.5.5-.5s.5.2.5.5-.2.5-.5.5-.5-.2-.5-.5z' fill='%23d4c9b4' fill-opacity='.3'/%3E%3C/svg%3E"); }
  </style>
</head>
<body class="font-body bg-cream-100 text-bark min-h-screen flex items-center justify-center p-4">
${body}
</body>
</html>`;
}

const inputClass =
  "w-full px-3 py-2.5 border border-cream-300 rounded-md font-body text-bark bg-cream-50 transition-all focus:outline-none focus:border-amber focus:ring-2 focus:ring-amber/15";
const labelClass =
  "block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1";
const btnAmber =
  "w-full px-4 py-3 bg-amber text-cream-50 rounded-md font-heading font-semibold text-sm cursor-pointer transition-colors hover:bg-amber-dark border-none";

export function applyPage(): string {
  return publicLayout(
    "Apply for a Grant",
    `<div class="w-full max-w-md">
    <div class="bg-white rounded-xl border border-cream-200 shadow-sm p-8">
      <h1 class="font-heading font-bold text-2xl text-bark mb-2">Apply for a Grant</h1>
      <p class="text-bark-muted text-sm mb-6">Fill in your details to enter this month's lottery.</p>

      <form action="/apply" method="POST">
        <div class="mb-4">
          <label class="${labelClass}" for="name">Name</label>
          <input class="${inputClass}" type="text" id="name" name="name" required />
        </div>
        <div class="mb-4">
          <label class="${labelClass}" for="phone">Phone Number</label>
          <input class="${inputClass}" type="tel" id="phone" name="phone" required />
        </div>
        <div class="mb-4">
          <label class="${labelClass}" for="email">Email (optional)</label>
          <input class="${inputClass}" type="email" id="email" name="email" />
        </div>
        <div class="mb-4">
          <label class="${labelClass}" for="meetingPlace">Meeting Place or Address</label>
          <input class="${inputClass}" type="text" id="meetingPlace" name="meetingPlace" required />
        </div>
        <div class="mb-4">
          <label class="${labelClass}">Payment Preference</label>
          <div class="flex gap-4">
            <label class="flex items-center gap-2 font-body text-bark cursor-pointer">
              <input type="radio" name="paymentPreference" value="cash" checked onchange="toggleBank()" />
              Cash
            </label>
            <label class="flex items-center gap-2 font-body text-bark cursor-pointer">
              <input type="radio" name="paymentPreference" value="bank" onchange="toggleBank()" />
              Bank Transfer
            </label>
          </div>
        </div>
        <div id="bankFields" style="display:none">
          <div class="mb-4">
            <label class="${labelClass}" for="sortCode">Sort Code</label>
            <input class="${inputClass}" type="text" id="sortCode" name="sortCode" />
          </div>
          <div class="mb-4">
            <label class="${labelClass}" for="accountNumber">Account Number</label>
            <input class="${inputClass}" type="text" id="accountNumber" name="accountNumber" />
          </div>
        </div>
        <button type="submit" class="${btnAmber}">Submit Application</button>
      </form>
    </div>
  </div>
  <script>
    function toggleBank() {
      var pref = document.querySelector('input[name="paymentPreference"]:checked');
      document.getElementById('bankFields').style.display = pref && pref.value === 'bank' ? '' : 'none';
    }
  </script>`,
  );
}

export function applyClosedPage(): string {
  return publicLayout(
    "Applications Closed",
    `<div class="w-full max-w-md">
    <div class="bg-white rounded-xl border border-cream-200 shadow-sm p-8 text-center">
      <h1 class="font-heading font-bold text-2xl text-bark mb-4">Applications Closed</h1>
      <p class="text-bark-muted">The application window is currently closed. Please check back later.</p>
    </div>
  </div>`,
  );
}

export function applyResultPage(status: string, reason?: string): string {
  let title: string;
  let message: string;

  if (status === "accepted") {
    title = "Application Received";
    message = "You've been added to this month's lottery pool. We'll be in touch after the draw.";
  } else if (status === "flagged") {
    title = "Application Received";
    message = "A volunteer will contact you shortly to confirm your identity.";
  } else if (reason === "window_closed") {
    title = "Window Closed";
    message = "The application window is currently closed. Please check back later.";
  } else if (reason === "cooldown") {
    title = "Too Soon";
    message = "You received a grant recently. Please try again in a few months.";
  } else if (reason === "duplicate") {
    title = "Already Applied";
    message = "You've already applied this month. You'll hear from us after the draw.";
  } else {
    title = "Application Received";
    message = "Your application has been received.";
  }

  return publicLayout(
    title,
    `<div class="w-full max-w-md">
    <div class="bg-white rounded-xl border border-cream-200 shadow-sm p-8 text-center">
      <h1 class="font-heading font-bold text-2xl text-bark mb-4">${escapeHtml(title)}</h1>
      <p class="text-bark-muted">${escapeHtml(message)}</p>
    </div>
  </div>`,
  );
}
```

**Step 4: Run test to verify it passes**

Run: `bun test test/unit/applyPage.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/web/pages/apply.ts test/unit/applyPage.test.ts
git commit -m "feat: add public application form page"
```

---

### Task 4: Build application form route handlers

**Files:**
- Create: `src/web/routes/apply.ts`
- Modify: `src/web/server.ts`
- Test: `test/integration/applyRoutes.test.ts`

**Step 1: Write failing test for the apply routes**

```ts
// test/integration/applyRoutes.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
  SQLiteConnectionPool,
  SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import type { RecipientRepository } from "../../src/domain/recipient/repository.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { SQLiteRecipientRepository } from "../../src/infrastructure/recipient/sqliteRecipientRepository.ts";
import { createApplyRoutes } from "../../src/web/routes/apply.ts";

describe("apply routes", () => {
  let eventStore: SQLiteEventStore;
  let pool: ReturnType<typeof SQLiteConnectionPool>;
  let recipientRepo: RecipientRepository;
  let routes: ReturnType<typeof createApplyRoutes>;

  beforeEach(async () => {
    const es = createEventStore(":memory:");
    eventStore = es.store;
    pool = es.pool;
    recipientRepo = await SQLiteRecipientRepository(pool);
    routes = createApplyRoutes(eventStore, pool, recipientRepo);
  });

  afterEach(async () => {
    await pool.close();
  });

  describe("showForm", () => {
    test("returns closed page when no window is open", async () => {
      const res = await routes.showForm();
      const html = await res.text();
      expect(html).toContain("closed");
    });

    test("returns form when window is open", async () => {
      await eventStore.appendToStream("lottery-2026-03", [
        {
          type: "ApplicationWindowOpened",
          data: { monthCycle: "2026-03", openedAt: "2026-03-01T00:00:00Z" },
        },
      ]);
      const res = await routes.showForm();
      const html = await res.text();
      expect(html).toContain('action="/apply"');
    });
  });

  describe("handleSubmit", () => {
    test("redirects to result with accepted status", async () => {
      await eventStore.appendToStream("lottery-2026-03", [
        {
          type: "ApplicationWindowOpened",
          data: { monthCycle: "2026-03", openedAt: "2026-03-01T00:00:00Z" },
        },
      ]);

      const form = new URLSearchParams({
        name: "Alice",
        phone: "07700900001",
        meetingPlace: "Mill Road",
        paymentPreference: "cash",
      });

      const req = new Request("http://localhost/apply", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });

      const res = await routes.handleSubmit(req);
      expect(res.status).toBe(302);
      const location = res.headers.get("Location");
      expect(location).toContain("/apply/result");
      expect(location).toContain("status=accepted");
    });

    test("redirects with rejected status when window closed", async () => {
      const form = new URLSearchParams({
        name: "Alice",
        phone: "07700900001",
        meetingPlace: "Mill Road",
        paymentPreference: "cash",
      });

      const req = new Request("http://localhost/apply", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });

      const res = await routes.handleSubmit(req);
      expect(res.status).toBe(302);
      const location = res.headers.get("Location");
      expect(location).toContain("status=rejected");
      expect(location).toContain("reason=window_closed");
    });

    test("returns 400 when name is missing", async () => {
      const form = new URLSearchParams({
        phone: "07700900001",
        meetingPlace: "Mill Road",
        paymentPreference: "cash",
      });

      const req = new Request("http://localhost/apply", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });

      const res = await routes.handleSubmit(req);
      expect(res.status).toBe(400);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/integration/applyRoutes.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the apply routes**

```ts
// src/web/routes/apply.ts
import type { SQLiteConnectionPool, SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import { toApplicantId } from "../../domain/application/applicantId.ts";
import { checkEligibility } from "../../domain/application/checkEligibility.ts";
import { submitApplication } from "../../domain/application/submitApplication.ts";
import type { PaymentPreference } from "../../domain/application/types.ts";
import type { RecipientRepository } from "../../domain/recipient/repository.ts";
import { applyClosedPage, applyPage, applyResultPage } from "../pages/apply.ts";

function currentMonthCycle(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function isWindowOpen(
  monthCycle: string,
  pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<boolean> {
  return pool.withConnection(async (conn) => {
    const tables = await conn.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='lottery_windows'",
    );
    if (tables.length === 0) return false;
    const rows = await conn.query<{ status: string }>(
      "SELECT status FROM lottery_windows WHERE month_cycle = ? LIMIT 1",
      [monthCycle],
    );
    return rows.length > 0 && rows[0]?.status === "open";
  });
}

export function createApplyRoutes(
  eventStore: SQLiteEventStore,
  pool: ReturnType<typeof SQLiteConnectionPool>,
  recipientRepo: RecipientRepository,
) {
  return {
    async showForm(): Promise<Response> {
      const monthCycle = currentMonthCycle();
      const open = await isWindowOpen(monthCycle, pool);
      const html = open ? applyPage() : applyClosedPage();
      return new Response(html, {
        headers: { "Content-Type": "text/html" },
      });
    },

    async handleSubmit(req: Request): Promise<Response> {
      const formData = await req.formData();
      const name = String(formData.get("name") ?? "").trim();
      const phone = String(formData.get("phone") ?? "").trim();
      const email = String(formData.get("email") ?? "").trim() || undefined;
      const meetingPlace = String(formData.get("meetingPlace") ?? "").trim();
      const paymentPref = String(formData.get("paymentPreference") ?? "cash");

      if (!name || !phone || !meetingPlace) {
        return new Response("Name, phone, and meeting place are required", {
          status: 400,
        });
      }

      const paymentPreference: PaymentPreference =
        paymentPref === "bank" ? "bank" : "cash";
      const monthCycle = currentMonthCycle();
      const applicantId = toApplicantId(phone);
      const eligibility = await checkEligibility(applicantId, monthCycle, pool);

      const applicationId = crypto.randomUUID();
      const { events } = await submitApplication(
        {
          applicationId,
          phone,
          name,
          email,
          paymentPreference,
          meetingPlace,
          monthCycle,
          eligibility,
        },
        eventStore,
        recipientRepo,
      );

      // Determine result from emitted events
      const lastEvent = events[events.length - 1];
      let status = "accepted";
      let reason = "";

      if (lastEvent?.type === "ApplicationRejected") {
        status = "rejected";
        reason = lastEvent.data.reason;
      } else if (lastEvent?.type === "ApplicationFlaggedForReview") {
        status = "flagged";
      }

      const params = new URLSearchParams({ status });
      if (reason) params.set("reason", reason);

      return Response.redirect(`/apply/result?${params}`, 302);
    },

    showResult(req: Request): Response {
      const url = new URL(req.url);
      const status = url.searchParams.get("status") ?? "accepted";
      const reason = url.searchParams.get("reason") ?? undefined;
      return new Response(applyResultPage(status, reason), {
        headers: { "Content-Type": "text/html" },
      });
    },
  };
}
```

**Step 4: Wire routes into server.ts**

Add to `src/web/server.ts`:
- Import `createApplyRoutes`
- Add `/apply` GET and POST routes (no auth)
- Add `/apply/result` GET route (no auth)

These are public routes — they go in the `routes` object but without `requireAuth`.

**Step 5: Run test to verify it passes**

Run: `bun test test/integration/applyRoutes.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/web/routes/apply.ts src/web/server.ts test/integration/applyRoutes.test.ts
git commit -m "feat: add public application form routes"
```

---

### Task 5: Build applications management page

**Files:**
- Create: `src/web/pages/applications.ts`
- Test: `test/unit/applicationsPage.test.ts`

**Step 1: Write test for the applications page HTML**

```ts
// test/unit/applicationsPage.test.ts
import { describe, expect, test } from "bun:test";
import type { ApplicationRow } from "../../src/domain/application/repository.ts";
import { applicationsPage } from "../../src/web/pages/applications.ts";

const app: ApplicationRow = {
  id: "app-1",
  applicantId: "applicant-07700900001",
  monthCycle: "2026-03",
  status: "accepted",
  rank: null,
  paymentPreference: "cash",
  name: "Alice",
  phone: "07700900001",
  rejectReason: null,
  appliedAt: "2026-03-01T10:00:00Z",
  acceptedAt: "2026-03-01T10:00:00Z",
  selectedAt: null,
  rejectedAt: null,
};

describe("applicationsPage", () => {
  test("renders table with applications", () => {
    const html = applicationsPage([app], ["2026-03"], "2026-03");
    expect(html).toContain("Alice");
    expect(html).toContain("07700900001");
    expect(html).toContain("Applications");
  });

  test("renders empty state", () => {
    const html = applicationsPage([], ["2026-03"], "2026-03");
    expect(html).toContain("No applications");
  });

  test("renders status badges", () => {
    const flagged = { ...app, status: "flagged" };
    const html = applicationsPage([app, flagged], ["2026-03"], "2026-03");
    expect(html).toContain("Accepted");
    expect(html).toContain("Flagged");
  });

  test("renders month cycle selector", () => {
    const html = applicationsPage([app], ["2026-03", "2026-04"], "2026-03");
    expect(html).toContain("2026-03");
    expect(html).toContain("2026-04");
  });

  test("includes Datastar attributes for row click", () => {
    const html = applicationsPage([app], ["2026-03"], "2026-03");
    expect(html).toContain("@get");
    expect(html).toContain("/applications/app-1");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/applicationsPage.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the applications page**

Create `src/web/pages/applications.ts` following the exact same pattern as `src/web/pages/recipients.ts`:
- Table with columns: Name, Phone, Status, Payment, Applied
- Month cycle dropdown that triggers `@get('/applications?month=...')`
- Row click triggers `@get('/applications/{id}')`
- Status badges with colors: accepted=blue, flagged=amber, rejected=red, selected=green, not_selected=gray
- Uses `layout()` wrapper

```ts
// src/web/pages/applications.ts
import type { ApplicationRow } from "../../domain/application/repository.ts";
import { layout } from "./layout.ts";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  accepted: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  flagged: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  rejected: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  selected: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  not_selected: { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200" },
  applied: { bg: "bg-cream-100", text: "text-bark-muted", border: "border-cream-200" },
};

function statusBadge(status: string): string {
  const colors = statusColors[status] ?? statusColors.applied!;
  const label = status === "not_selected" ? "Not Selected" : status.charAt(0).toUpperCase() + status.slice(1);
  return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors.bg} ${colors.text} ${colors.border}">${label}</span>`;
}

function paymentBadge(pref: string): string {
  if (pref === "bank") {
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200">Bank</span>`;
  }
  return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-green-50 text-green-700 border-green-200">Cash</span>`;
}

export function applicationRow(a: ApplicationRow): string {
  return `<tr
    class="border-b border-cream-200 hover:bg-cream-50 cursor-pointer transition-colors"
    data-on-click="@get('/applications/${encodeURIComponent(a.id)}')">
    <td class="px-4 py-3 font-medium text-bark">${escapeHtml(a.name ?? "Unknown")}</td>
    <td class="px-4 py-3 text-bark-muted">${escapeHtml(a.phone ?? "")}</td>
    <td class="px-4 py-3">${statusBadge(a.status)}</td>
    <td class="px-4 py-3">${paymentBadge(a.paymentPreference)}</td>
    <td class="px-4 py-3 text-bark-muted text-sm">${a.appliedAt ? formatDate(a.appliedAt) : ""}</td>
  </tr>`;
}

export function applicationsTableBody(applications: ApplicationRow[]): string {
  if (applications.length === 0) {
    return '<tbody id="application-rows"><tr><td colspan="5" class="text-center py-12 text-bark-muted">No applications for this month</td></tr></tbody>';
  }
  return `<tbody id="application-rows">${applications.map(applicationRow).join("")}</tbody>`;
}

export function applicationsPage(
  applications: ApplicationRow[],
  months: string[],
  currentMonth: string,
): string {
  const rows = applications.length === 0
    ? `<tr><td colspan="5" class="text-center py-12 text-bark-muted">No applications for this month</td></tr>`
    : applications.map(applicationRow).join("\n");

  const monthOptions = months
    .map((m) => `<option value="${escapeHtml(m)}" ${m === currentMonth ? "selected" : ""}>${escapeHtml(m)}</option>`)
    .join("");

  const body = `<div class="max-w-5xl mx-auto px-4 py-8" data-signals='{"month": "${escapeHtml(currentMonth)}"}'>
  <div class="flex items-center justify-between mb-6">
    <div class="flex items-center gap-3">
      <a href="/" class="text-bark-muted hover:text-bark transition-colors text-sm">&larr; Back</a>
      <h1 class="font-heading text-2xl font-semibold text-bark">Applications</h1>
    </div>
    <select
      data-bind-month
      data-on-change="@get('/applications?month=' + $month)"
      class="px-3 py-2 rounded-lg border border-cream-300 bg-white text-bark text-sm focus:outline-none focus:ring-2 focus:ring-amber focus:border-transparent">
      ${monthOptions}
    </select>
  </div>

  <div class="bg-white rounded-xl border border-cream-200 shadow-sm">
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="border-b-2 border-cream-300 bg-cream-100">
            <th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Name</th>
            <th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Phone</th>
            <th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Status</th>
            <th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Payment</th>
            <th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Applied</th>
          </tr>
        </thead>
        <tbody id="application-rows">
          ${rows}
        </tbody>
      </table>
    </div>
  </div>

  <div id="panel"></div>
</div>`;

  return layout("Applications", body);
}
```

**Step 4: Run test to verify it passes**

Run: `bun test test/unit/applicationsPage.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/web/pages/applications.ts test/unit/applicationsPage.test.ts
git commit -m "feat: add applications management page"
```

---

### Task 6: Build application detail panel

**Files:**
- Create: `src/web/pages/applicationPanel.ts`
- Test: `test/unit/applicationPanel.test.ts`

**Step 1: Write test for the panel HTML**

```ts
// test/unit/applicationPanel.test.ts
import { describe, expect, test } from "bun:test";
import type { ApplicationRow } from "../../src/domain/application/repository.ts";
import { viewPanel, reviewPanel } from "../../src/web/pages/applicationPanel.ts";

const app: ApplicationRow = {
  id: "app-1",
  applicantId: "applicant-07700900001",
  monthCycle: "2026-03",
  status: "accepted",
  rank: null,
  paymentPreference: "cash",
  name: "Alice",
  phone: "07700900001",
  rejectReason: null,
  appliedAt: "2026-03-01T10:00:00Z",
  acceptedAt: "2026-03-01T10:00:00Z",
  selectedAt: null,
  rejectedAt: null,
};

describe("viewPanel", () => {
  test("shows application details", () => {
    const html = viewPanel(app);
    expect(html).toContain("Alice");
    expect(html).toContain("07700900001");
    expect(html).toContain("Cash");
  });

  test("shows reject reason when rejected", () => {
    const rejected = { ...app, status: "rejected", rejectReason: "cooldown" };
    const html = viewPanel(rejected);
    expect(html).toContain("cooldown");
  });

  test("shows rank when selected", () => {
    const selected = { ...app, status: "selected", rank: 3 };
    const html = viewPanel(selected);
    expect(html).toContain("3");
  });
});

describe("reviewPanel", () => {
  test("shows confirm and reject buttons for flagged app", () => {
    const flagged = { ...app, status: "flagged" };
    const html = reviewPanel(flagged);
    expect(html).toContain("Confirm");
    expect(html).toContain("Reject");
    expect(html).toContain("@post");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/applicationPanel.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the panel**

Create `src/web/pages/applicationPanel.ts` following the pattern from `src/web/pages/recipientPanel.ts`:
- `viewPanel(app)` — read-only detail view with close button
- `reviewPanel(app)` — for flagged apps, adds Confirm/Reject buttons
- Same `panelWrapper`, `field` helper pattern

```ts
// src/web/pages/applicationPanel.ts
import type { ApplicationRow } from "../../domain/application/repository.ts";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function panelWrapper(content: string): string {
  return `<div id="panel" class="fixed top-0 right-0 h-full w-96 bg-cream-50 border-l border-cream-200 shadow-lg overflow-y-auto animate-[slideIn_0.2s_ease-out] z-50">
  <div class="p-6">${content}</div>
  <style>@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }</style>
</div>`;
}

function field(label: string, value: string): string {
  return `<div class="mb-4">
    <dt class="text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">${label}</dt>
    <dd class="font-body text-bark">${escapeHtml(value)}</dd>
  </div>`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const btnSecondary =
  "px-4 py-2 rounded-md font-heading font-semibold text-sm border border-cream-200 text-bark hover:bg-cream-100 cursor-pointer transition-colors bg-transparent";
const btnAmber =
  "px-4 py-2 bg-amber text-cream-50 rounded-md font-heading font-semibold text-sm cursor-pointer transition-colors hover:bg-amber-dark border-none";
const btnDanger =
  "px-4 py-2 rounded-md text-sm font-semibold bg-red-600 text-white cursor-pointer border-none hover:bg-red-700 transition-colors";

function statusLabel(status: string): string {
  return status === "not_selected" ? "Not Selected" : status.charAt(0).toUpperCase() + status.slice(1);
}

function commonFields(app: ApplicationRow): string {
  let fields = "";
  fields += field("Name", app.name ?? "Unknown");
  fields += field("Phone", app.phone ?? "");
  fields += field("Status", statusLabel(app.status));
  fields += field("Payment Preference", app.paymentPreference === "bank" ? "Bank Transfer" : "Cash");
  fields += field("Month Cycle", app.monthCycle);
  if (app.appliedAt) fields += field("Applied", formatDate(app.appliedAt));
  if (app.rejectReason) fields += field("Reject Reason", app.rejectReason);
  if (app.rank != null) fields += field("Lottery Rank", String(app.rank));
  return fields;
}

export function viewPanel(app: ApplicationRow): string {
  return panelWrapper(`
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-heading font-bold text-xl text-bark">${escapeHtml(app.name ?? "Application")}</h2>
      <button class="${btnSecondary}" data-on-click="@get('/applications/close')">Close</button>
    </div>
    <dl>${commonFields(app)}</dl>
  `);
}

export function reviewPanel(app: ApplicationRow): string {
  return panelWrapper(`
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-heading font-bold text-xl text-bark">Review Application</h2>
      <button class="${btnSecondary}" data-on-click="@get('/applications/close')">Close</button>
    </div>
    <dl>${commonFields(app)}</dl>
    <div class="flex gap-3 mt-6">
      <button class="${btnAmber}" data-on-click="@post('/applications/${app.id}/review?decision=confirm')">Confirm Identity</button>
      <button class="${btnDanger}" data-on-click="@post('/applications/${app.id}/review?decision=reject')">Reject</button>
    </div>
  `);
}
```

**Step 4: Run test to verify it passes**

Run: `bun test test/unit/applicationPanel.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/web/pages/applicationPanel.ts test/unit/applicationPanel.test.ts
git commit -m "feat: add application detail and review panels"
```

---

### Task 7: Build applications management route handlers

**Files:**
- Create: `src/web/routes/applications.ts`
- Modify: `src/web/server.ts`
- Test: `test/integration/applicationRoutes.test.ts`

**Step 1: Write failing test**

```ts
// test/integration/applicationRoutes.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
  SQLiteConnectionPool,
  SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import type { RecipientRepository } from "../../src/domain/recipient/repository.ts";
import type { ApplicationRepository } from "../../src/domain/application/repository.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { SQLiteRecipientRepository } from "../../src/infrastructure/recipient/sqliteRecipientRepository.ts";
import { SQLiteApplicationRepository } from "../../src/infrastructure/application/sqliteApplicationRepository.ts";
import { submitApplication } from "../../src/domain/application/submitApplication.ts";
import { createApplicationRoutes } from "../../src/web/routes/applications.ts";

describe("application routes", () => {
  let eventStore: SQLiteEventStore;
  let pool: ReturnType<typeof SQLiteConnectionPool>;
  let recipientRepo: RecipientRepository;
  let appRepo: ApplicationRepository;
  let routes: ReturnType<typeof createApplicationRoutes>;

  beforeEach(async () => {
    const es = createEventStore(":memory:");
    eventStore = es.store;
    pool = es.pool;
    recipientRepo = await SQLiteRecipientRepository(pool);
    appRepo = SQLiteApplicationRepository(pool);
    routes = createApplicationRoutes(appRepo, recipientRepo, eventStore, pool);
  });

  afterEach(async () => {
    await pool.close();
  });

  async function seedApp(id: string, month: string, name: string, phone: string) {
    await eventStore.appendToStream(`lottery-${month}`, [
      {
        type: "ApplicationWindowOpened",
        data: { monthCycle: month, openedAt: `${month}-01T00:00:00Z` },
      },
    ]);
    await submitApplication(
      {
        applicationId: id,
        phone,
        name,
        paymentPreference: "cash",
        meetingPlace: "Mill Road",
        monthCycle: month,
        eligibility: { status: "eligible" },
      },
      eventStore,
      recipientRepo,
    );
  }

  describe("list", () => {
    test("returns HTML page with applications for given month", async () => {
      await seedApp("app-1", "2026-03", "Alice", "07700900001");
      const res = await routes.list("2026-03");
      expect(res.headers.get("Content-Type")).toBe("text/html");
      const html = await res.text();
      expect(html).toContain("Alice");
    });

    test("returns empty state for month with no applications", async () => {
      const res = await routes.list("2026-03");
      const html = await res.text();
      expect(html).toContain("No applications");
    });
  });

  describe("detail", () => {
    test("returns SSE with view panel", async () => {
      await seedApp("app-1", "2026-03", "Alice", "07700900001");
      const res = await routes.detail("app-1");
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");
      const body = await res.text();
      expect(body).toContain("Alice");
    });

    test("returns review panel for flagged application", async () => {
      // Create recipient first, then submit with different name
      await seedApp("app-first", "2026-03", "Alice", "07700900001");

      await submitApplication(
        {
          applicationId: "app-flagged",
          phone: "07700900001",
          name: "Bob",
          paymentPreference: "cash",
          meetingPlace: "Station",
          monthCycle: "2026-03",
          eligibility: { status: "eligible" },
        },
        eventStore,
        recipientRepo,
      );

      const res = await routes.detail("app-flagged");
      const body = await res.text();
      expect(body).toContain("Confirm");
      expect(body).toContain("Reject");
    });

    test("returns 404 for unknown id", async () => {
      const res = await routes.detail("nonexistent");
      expect(res.status).toBe(404);
    });
  });

  describe("handleReview", () => {
    test("confirms flagged application", async () => {
      await seedApp("app-first", "2026-03", "Alice", "07700900001");

      await submitApplication(
        {
          applicationId: "app-flagged",
          phone: "07700900001",
          name: "Bob",
          paymentPreference: "cash",
          meetingPlace: "Station",
          monthCycle: "2026-03",
          eligibility: { status: "eligible" },
        },
        eventStore,
        recipientRepo,
      );

      const res = await routes.handleReview("app-flagged", "confirm", "vol-1");
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");

      const updated = await appRepo.getById("app-flagged");
      expect(updated!.status).toBe("accepted");
    });

    test("rejects flagged application", async () => {
      await seedApp("app-first", "2026-03", "Alice", "07700900001");

      await submitApplication(
        {
          applicationId: "app-flagged",
          phone: "07700900001",
          name: "Bob",
          paymentPreference: "cash",
          meetingPlace: "Station",
          monthCycle: "2026-03",
          eligibility: { status: "eligible" },
        },
        eventStore,
        recipientRepo,
      );

      const res = await routes.handleReview("app-flagged", "reject", "vol-1");
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");

      const updated = await appRepo.getById("app-flagged");
      expect(updated!.status).toBe("rejected");
    });
  });

  describe("closePanel", () => {
    test("returns SSE with empty panel div", () => {
      const res = routes.closePanel();
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/integration/applicationRoutes.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the application routes**

```ts
// src/web/routes/applications.ts
import type { SQLiteConnectionPool, SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import { toApplicantId } from "../../domain/application/applicantId.ts";
import { checkEligibility } from "../../domain/application/checkEligibility.ts";
import type { ApplicationRepository } from "../../domain/application/repository.ts";
import { reviewApplication } from "../../domain/application/reviewApplication.ts";
import type { RecipientRepository } from "../../domain/recipient/repository.ts";
import { reviewPanel, viewPanel } from "../pages/applicationPanel.ts";
import { applicationsPage, applicationsTableBody } from "../pages/applications.ts";
import { patchElements, sseResponse } from "../sse.ts";

function currentMonthCycle(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function createApplicationRoutes(
  appRepo: ApplicationRepository,
  recipientRepo: RecipientRepository,
  eventStore: SQLiteEventStore,
  pool: ReturnType<typeof SQLiteConnectionPool>,
) {
  return {
    async list(month?: string): Promise<Response> {
      const months = await appRepo.listDistinctMonths();
      const currentMonth = month ?? months[0] ?? currentMonthCycle();
      const applications = await appRepo.listByMonth(currentMonth);
      return new Response(applicationsPage(applications, months, currentMonth), {
        headers: { "Content-Type": "text/html" },
      });
    },

    async detail(id: string): Promise<Response> {
      const app = await appRepo.getById(id);
      if (!app) return new Response("Not found", { status: 404 });
      const panel = app.status === "flagged" ? reviewPanel(app) : viewPanel(app);
      return sseResponse(patchElements(panel));
    },

    async handleReview(
      applicationId: string,
      decision: "confirm" | "reject",
      volunteerId: string,
    ): Promise<Response> {
      const app = await appRepo.getById(applicationId);
      if (!app) return new Response("Not found", { status: 404 });

      const eligibility = decision === "confirm"
        ? await checkEligibility(app.applicantId, app.monthCycle, pool)
        : { status: "eligible" as const };

      await reviewApplication(
        applicationId,
        volunteerId,
        decision,
        eligibility,
        eventStore,
      );

      const updated = await appRepo.getById(applicationId);
      if (!updated) return new Response("Not found", { status: 404 });

      const applications = await appRepo.listByMonth(app.monthCycle);
      return sseResponse(
        patchElements(viewPanel(updated)),
        patchElements(applicationsTableBody(applications)),
      );
    },

    closePanel(): Response {
      return sseResponse(patchElements('<div id="panel"></div>'));
    },
  };
}
```

**Step 4: Wire routes into server.ts**

Add to `src/web/server.ts`:
- Import `createApplicationRoutes` and `SQLiteApplicationRepository`
- Create `applicationRepo` and `applicationRoutes` in `startServer`
- Add `/applications` GET route (auth, no admin gate)
- Add `/applications/close` GET route
- In `fetch()`, add pattern matching for:
  - `GET /applications/:id` → `applicationRoutes.detail(id)`
  - `POST /applications/:id/review` → read `decision` from query params, call `applicationRoutes.handleReview(id, decision, volunteer.id)`

**Step 5: Run test to verify it passes**

Run: `bun test test/integration/applicationRoutes.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/web/routes/applications.ts src/web/server.ts test/integration/applicationRoutes.test.ts
git commit -m "feat: add applications management routes with review"
```

---

### Task 8: Lint, format, and run full test suite

**Step 1: Run biome**

```bash
bunx biome check --write
```

**Step 2: Run full test suite**

```bash
bun test
```

Fix any failures.

**Step 3: Commit any formatting changes**

```bash
git add -u
git commit -m "chore: lint and format"
```
