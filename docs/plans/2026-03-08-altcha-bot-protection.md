# ALTCHA Bot Protection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add ALTCHA proof-of-work challenge to the application form to prevent bot spam.

**Architecture:** Server generates PoW challenges via `altcha-lib`, the `altcha` web component solves them client-side, and the server verifies the solution on form POST. The HMAC key is stored in `.env`.

**Tech Stack:** `altcha` (web component), `altcha-lib` (server-side challenge/verify), Bun

---

### Task 1: Install dependencies

**Step 1: Install packages**

Run: `bun add altcha altcha-lib`

**Step 2: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: add altcha dependencies for bot protection"
```

---

### Task 2: Add ALTCHA challenge API endpoint

**Files:**
- Create: `src/web/routes/altcha.ts`
- Modify: `src/web/server.ts`

**Step 1: Write the failing test**

File: `test/unit/altchaRoute.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import { createAltchaRoutes } from "../../src/web/routes/altcha.ts";

describe("altcha challenge route", () => {
	const routes = createAltchaRoutes("test-hmac-key");

	test("returns a challenge JSON with required fields", async () => {
		const res = await routes.challenge();
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("application/json");
		const body = await res.json();
		expect(body).toHaveProperty("algorithm");
		expect(body).toHaveProperty("challenge");
		expect(body).toHaveProperty("salt");
		expect(body).toHaveProperty("maxnumber");
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/altchaRoute.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

File: `src/web/routes/altcha.ts`

```ts
import { createChallenge } from "altcha-lib";

export function createAltchaRoutes(hmacKey: string) {
	return {
		async challenge(): Promise<Response> {
			const challenge = await createChallenge({ hmacKey, maxNumber: 50000 });
			return new Response(JSON.stringify(challenge), {
				headers: { "Content-Type": "application/json" },
			});
		},
	};
}
```

**Step 4: Run test to verify it passes**

Run: `bun test test/unit/altchaRoute.test.ts`
Expected: PASS

**Step 5: Add route to server**

Modify: `src/web/server.ts`

Add import at the top:
```ts
import { createAltchaRoutes } from "./routes/altcha.ts";
```

Inside `startServer`, after existing route setup:
```ts
const altchaRoutes = createAltchaRoutes(process.env.ALTCHA_HMAC_KEY ?? "change-me-in-production");
```

Add to the `routes` object:
```ts
"/api/altcha/challenge": {
	GET: () => altchaRoutes.challenge(),
},
```

**Step 6: Commit**

```bash
git add src/web/routes/altcha.ts test/unit/altchaRoute.test.ts src/web/server.ts
git commit -m "feat: add ALTCHA challenge API endpoint"
```

---

### Task 3: Add ALTCHA widget to apply form

**Files:**
- Modify: `src/web/pages/apply.ts`

**Step 1: Update the existing applyPage test**

File: `test/unit/applyPage.test.ts`

Add a test in the `applyPage` describe block:

```ts
test("includes altcha widget", () => {
	const html = applyPage();
	expect(html).toContain("altcha-widget");
	expect(html).toContain("/api/altcha/challenge");
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/applyPage.test.ts`
Expected: FAIL — "altcha-widget" not found

**Step 3: Add ALTCHA widget to the form**

Modify: `src/web/pages/apply.ts`

In the `publicLayout` function, add the ALTCHA script tag before `</head>`:
```html
<script async defer src="https://cdn.jsdelivr.net/npm/altcha/dist/altcha.min.js" type="module"></script>
```

In the `applyPage` function, add the widget just before the submit button:
```html
<div>
	<altcha-widget challengeurl="/api/altcha/challenge" hidefooter></altcha-widget>
</div>
```

**Step 4: Run test to verify it passes**

Run: `bun test test/unit/applyPage.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/web/pages/apply.ts test/unit/applyPage.test.ts
git commit -m "feat: add ALTCHA widget to application form"
```

---

### Task 4: Verify ALTCHA solution on form submission

**Files:**
- Modify: `src/web/routes/apply.ts`

**Step 1: Write the failing test**

File: `test/integration/applyRoutes.test.ts`

Add a new test in the `handleSubmit` describe block:

```ts
test("returns 400 when altcha token is missing", async () => {
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
	expect(res.status).toBe(400);
	const text = await res.text();
	expect(text).toContain("verification");
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/integration/applyRoutes.test.ts`
Expected: FAIL — status is 302 not 400

**Step 3: Add server-side verification**

Modify: `src/web/routes/apply.ts`

Add import:
```ts
import { verifySolution } from "altcha-lib";
```

Update `createApplyRoutes` signature to accept `hmacKey`:
```ts
export function createApplyRoutes(
	eventStore: SQLiteEventStore,
	pool: ReturnType<typeof SQLiteConnectionPool>,
	recipientRepo: RecipientRepository,
	hmacKey: string,
)
```

In `handleSubmit`, after extracting form data and before the field validation, add:
```ts
const altcha = String(formData.get("altcha") ?? "");
if (!altcha) {
	return new Response("Bot verification failed", { status: 400 });
}
const verified = await verifySolution(altcha, hmacKey);
if (!verified) {
	return new Response("Bot verification failed", { status: 400 });
}
```

**Step 4: Update the createApplyRoutes call in server.ts**

Modify: `src/web/server.ts`

```ts
const hmacKey = process.env.ALTCHA_HMAC_KEY ?? "change-me-in-production";
const altchaRoutes = createAltchaRoutes(hmacKey);
const applyRoutes = createApplyRoutes(eventStore, pool, recipientRepo, hmacKey);
```

**Step 5: Update test setup to pass hmacKey**

Modify: `test/integration/applyRoutes.test.ts`

Update the `beforeEach` to pass the hmac key:
```ts
routes = createApplyRoutes(eventStore, pool, recipientRepo, "test-hmac-key");
```

**Step 6: Fix existing integration tests that now fail (missing altcha token)**

The existing `handleSubmit` tests will now fail because they don't include an altcha token. Use `altcha-lib` to generate valid tokens in the test setup.

Add import to test file:
```ts
import { createChallenge, solveChallenge } from "altcha-lib";
```

Add a helper at the top of the describe block:
```ts
const hmacKey = "test-hmac-key";

async function generateAltchaToken(): Promise<string> {
	const challenge = await createChallenge({ hmacKey, maxNumber: 10 });
	const solution = await solveChallenge(
		challenge.challenge,
		challenge.salt,
		challenge.algorithm,
		challenge.maxnumber,
	);
	return btoa(JSON.stringify({
		algorithm: challenge.algorithm,
		challenge: challenge.challenge,
		number: solution.number,
		salt: challenge.salt,
		signature: challenge.signature,
	}));
}
```

Update existing tests that submit the form to include the altcha token in the form data:
```ts
const altchaToken = await generateAltchaToken();
// add to the URLSearchParams:
form.set("altcha", altchaToken);
```

**Step 7: Run tests to verify all pass**

Run: `bun test test/integration/applyRoutes.test.ts`
Expected: ALL PASS

**Step 8: Commit**

```bash
git add src/web/routes/apply.ts src/web/server.ts test/integration/applyRoutes.test.ts
git commit -m "feat: verify ALTCHA solution on form submission"
```

---

### Task 5: Add ALTCHA_HMAC_KEY to .env

**Step 1: Generate a random key and create .env**

```bash
echo "ALTCHA_HMAC_KEY=$(openssl rand -hex 32)" >> .env
```

**Step 2: Ensure .env is in .gitignore**

Check `.gitignore` contains `.env`. If not, add it.

**Step 3: Commit .gitignore if changed**

---

### Task 6: Run full test suite and lint

**Step 1: Lint and format**

Run: `bunx biome check --write`

**Step 2: Run all tests**

Run: `bun test`
Expected: ALL PASS

**Step 3: Commit any lint fixes**
