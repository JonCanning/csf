import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import type { ApplicationRepository } from "../../src/domain/application/repository.ts";
import { SQLiteApplicationRepository } from "../../src/infrastructure/application/sqliteApplicationRepository.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";

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

	async function seedApplication(
		id: string,
		monthCycle: string,
		name: string,
		phone: string,
	) {
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
