import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { createChallenge, solveChallenge } from "altcha-lib";
import type { ApplicantRepository } from "../../src/domain/applicant/repository.ts";
import { SQLiteApplicantRepository } from "../../src/infrastructure/applicant/sqliteApplicantRepository.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { createApplyRoutes } from "../../src/web/routes/apply.ts";

describe("apply routes", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let applicantRepo: ApplicantRepository;
	let routes: ReturnType<typeof createApplyRoutes>;
	const hmacKey = "test-hmac-key";

	async function generateAltchaToken(): Promise<string> {
		const challenge = await createChallenge({ hmacKey, maxNumber: 10 });
		const solver = solveChallenge(
			challenge.challenge,
			challenge.salt,
			challenge.algorithm,
			challenge.maxnumber,
		);
		const solution = await solver.promise;
		return btoa(
			JSON.stringify({
				algorithm: challenge.algorithm,
				challenge: challenge.challenge,
				number: solution.number,
				salt: challenge.salt,
				signature: challenge.signature,
			}),
		);
	}

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;
		applicantRepo = await SQLiteApplicantRepository(pool);
		routes = createApplyRoutes(eventStore, pool, applicantRepo, hmacKey);
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

		test("redirects to result with accepted status", async () => {
			await eventStore.appendToStream("lottery-2026-03", [
				{
					type: "ApplicationWindowOpened",
					data: { monthCycle: "2026-03", openedAt: "2026-03-01T00:00:00Z" },
				},
			]);

			const altchaToken = await generateAltchaToken();
			const form = new URLSearchParams({
				name: "Alice",
				phone: "07700900001",
				meetingPlace: "Mill Road",
				paymentPreference: "cash",
			});
			form.set("altcha", altchaToken);

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
			const altchaToken = await generateAltchaToken();
			const form = new URLSearchParams({
				name: "Alice",
				phone: "07700900001",
				meetingPlace: "Mill Road",
				paymentPreference: "cash",
			});
			form.set("altcha", altchaToken);

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
			const altchaToken = await generateAltchaToken();
			const form = new URLSearchParams({
				phone: "07700900001",
				meetingPlace: "Mill Road",
				paymentPreference: "cash",
			});
			form.set("altcha", altchaToken);

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
