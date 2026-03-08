import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import {
	createApplicant,
	deleteApplicant,
	updateApplicant,
} from "../../src/domain/applicant/commandHandlers.ts";
import type { ApplicantRepository } from "../../src/domain/applicant/repository.ts";
import type { ApplicantEvent } from "../../src/domain/applicant/types.ts";
import { SQLiteApplicantRepository } from "../../src/infrastructure/applicant/sqliteApplicantRepository.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";

describe("Applicant (event-sourced)", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let repo: ApplicantRepository;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;
		repo = await SQLiteApplicantRepository(pool);
	});

	afterEach(async () => {
		await pool.close();
	});

	describe("create", () => {
		test("creates an applicant with required fields", async () => {
			const { id } = await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);

			const found = await repo.getById(id);
			expect(found).not.toBeNull();
			expect(found!.phone).toBe("07700900001");
			expect(found!.name).toBe("Alice");
			expect(found!.createdAt).toBeString();
			expect(found!.updatedAt).toBeString();
		});

		test("creates an applicant with email", async () => {
			const { id } = await createApplicant(
				{
					phone: "07700900001",
					name: "Alice",
					email: "alice@example.com",
				},
				eventStore,
			);

			const found = await repo.getById(id);
			expect(found).not.toBeNull();
			expect(found!.email).toBe("alice@example.com");
		});

		test("rejects duplicate phone+name", async () => {
			await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			let threw = false;
			try {
				await createApplicant(
					{ phone: "07700900001", name: "Alice" },
					eventStore,
				);
			} catch {
				threw = true;
			}
			expect(threw).toBe(true);
		});

		test("allows same phone with different name", async () => {
			await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			const { id } = await createApplicant(
				{ phone: "07700900001", name: "Bob" },
				eventStore,
			);

			const found = await repo.getById(id);
			expect(found).not.toBeNull();
			expect(found!.name).toBe("Bob");
			expect(found!.phone).toBe("07700900001");
		});
	});

	describe("getById", () => {
		test("returns null for unknown id", async () => {
			const found = await repo.getById("nonexistent");
			expect(found).toBeNull();
		});
	});

	describe("getByPhone", () => {
		test("returns all with matching phone", async () => {
			await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			await createApplicant({ phone: "07700900001", name: "Bob" }, eventStore);

			const found = await repo.getByPhone("07700900001");
			expect(found).toHaveLength(2);
		});

		test("returns empty for unknown phone", async () => {
			const found = await repo.getByPhone("00000000000");
			expect(found).toHaveLength(0);
		});
	});

	describe("getByPhoneAndName", () => {
		test("returns exact match", async () => {
			await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);

			const found = await repo.getByPhoneAndName("07700900001", "Alice");
			expect(found).not.toBeNull();
			expect(found!.name).toBe("Alice");
		});

		test("returns null for different name", async () => {
			await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);

			const found = await repo.getByPhoneAndName("07700900001", "Bob");
			expect(found).toBeNull();
		});
	});

	describe("list", () => {
		test("returns all applicants", async () => {
			await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			await createApplicant({ phone: "07700900002", name: "Bob" }, eventStore);
			const all = await repo.list();

			expect(all).toHaveLength(2);
		});

		test("returns empty array when no applicants", async () => {
			const all = await repo.list();
			expect(all).toHaveLength(0);
		});
	});

	describe("update", () => {
		test("updates email", async () => {
			const { id } = await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			await updateApplicant(
				id,
				"v-1",
				{ email: "alice@example.com" },
				eventStore,
			);

			const found = await repo.getById(id);
			expect(found!.email).toBe("alice@example.com");
			expect(found!.name).toBe("Alice");
		});
	});

	describe("delete", () => {
		test("deletes an applicant", async () => {
			const { id } = await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			await deleteApplicant(id, "v-1", eventStore);
			const found = await repo.getById(id);

			expect(found).toBeNull();
		});
	});

	describe("audit trail", () => {
		test("volunteerId stored in event", async () => {
			const { id } = await createApplicant(
				{ volunteerId: "v-1", phone: "07700900001", name: "Alice" },
				eventStore,
			);

			const { events } = await eventStore.readStream<ApplicantEvent>(
				`applicant-${id}`,
			);
			const created = events.find((e) => e.type === "ApplicantCreated");
			expect(created).toBeDefined();
			expect(created!.data.volunteerId).toBe("v-1");
		});
	});
});
