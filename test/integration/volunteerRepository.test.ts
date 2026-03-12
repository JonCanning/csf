import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import {
	createVolunteer,
	disableVolunteer,
	enableVolunteer,
	updateVolunteer,
} from "../../src/domain/volunteer/commandHandlers.ts";
import type {
	VolunteerCredentialsStore,
	VolunteerRepository,
} from "../../src/domain/volunteer/repository.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { SQLiteVolunteerCredentialsStore } from "../../src/infrastructure/volunteer/sqliteVolunteerCredentialsStore.ts";
import { SQLiteVolunteerRepository } from "../../src/infrastructure/volunteer/sqliteVolunteerRepository.ts";

describe("Volunteer (event-sourced)", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let repo: VolunteerRepository;
	let credentialsStore: VolunteerCredentialsStore;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;
		repo = await SQLiteVolunteerRepository(pool);
		credentialsStore = await SQLiteVolunteerCredentialsStore(pool);
	});

	afterEach(async () => {
		await pool.close();
	});

	describe("create", () => {
		test("creates a volunteer with required fields", async () => {
			const { id } = await createVolunteer(
				{ name: "Alice", password: "secret123" },
				eventStore,
				credentialsStore,
			);

			const found = await repo.getById(id);
			expect(found).not.toBeNull();
			expect(found!.name).toBe("Alice");
			expect(found!.phone).toBeUndefined();
			expect(found!.email).toBeUndefined();
			expect(found!.createdAt).toBeString();
			expect(found!.updatedAt).toBeString();
		});

		test("creates a volunteer with all fields", async () => {
			const { id } = await createVolunteer(
				{
					name: "Alice",
					phone: "07700900001",
					email: "alice@example.com",
					password: "secret123",
				},
				eventStore,
				credentialsStore,
			);

			const found = await repo.getById(id);
			expect(found).not.toBeNull();
			expect(found!.phone).toBe("07700900001");
			expect(found!.email).toBe("alice@example.com");
		});

		test("does not expose password hash in read model", async () => {
			const { id } = await createVolunteer(
				{ name: "Alice", password: "secret123" },
				eventStore,
				credentialsStore,
			);

			const found = await repo.getById(id);
			expect(found).not.toBeNull();
			expect((found as Record<string, unknown>).passwordHash).toBeUndefined();
			expect((found as Record<string, unknown>).password_hash).toBeUndefined();
			expect((found as Record<string, unknown>).password).toBeUndefined();
		});
	});

	describe("isAdmin", () => {
		test("stores and retrieves isAdmin flag", async () => {
			await createVolunteer(
				{ name: "Admin", password: "pw", isAdmin: true },
				eventStore,
				credentialsStore,
			);
			const vol = await repo.getByName("Admin");
			expect(vol?.isAdmin).toBe(true);
			expect(vol?.requiresPasswordReset).toBe(true);
		});

		test("defaults isAdmin to false", async () => {
			await createVolunteer(
				{ name: "Regular", password: "pw" },
				eventStore,
				credentialsStore,
			);
			const vol = await repo.getByName("Regular");
			expect(vol?.isAdmin).toBe(false);
		});
	});

	describe("getById", () => {
		test("returns volunteer by id", async () => {
			const { id } = await createVolunteer(
				{ name: "Alice", password: "secret123" },
				eventStore,
				credentialsStore,
			);
			const found = await repo.getById(id);

			expect(found).not.toBeNull();
			expect(found!.name).toBe("Alice");
		});

		test("returns null for unknown id", async () => {
			const found = await repo.getById("nonexistent");
			expect(found).toBeNull();
		});
	});

	describe("list", () => {
		test("returns all volunteers", async () => {
			await createVolunteer(
				{ name: "Alice", password: "secret123" },
				eventStore,
				credentialsStore,
			);
			await createVolunteer(
				{ name: "Bob", password: "secret456" },
				eventStore,
				credentialsStore,
			);
			const all = await repo.list();

			expect(all).toHaveLength(2);
		});

		test("returns empty array when no volunteers", async () => {
			const all = await repo.list();
			expect(all).toHaveLength(0);
		});
	});

	describe("update", () => {
		test("updates name", async () => {
			const { id } = await createVolunteer(
				{ name: "Alice", password: "secret123" },
				eventStore,
				credentialsStore,
			);
			await updateVolunteer(
				id,
				{ name: "Alicia" },
				eventStore,
				credentialsStore,
			);

			const found = await repo.getById(id);
			expect(found!.name).toBe("Alicia");
		});

		test("updates password", async () => {
			const { id } = await createVolunteer(
				{ name: "Alice", password: "secret123" },
				eventStore,
				credentialsStore,
			);
			await updateVolunteer(
				id,
				{ password: "newsecret" },
				eventStore,
				credentialsStore,
			);

			expect(await repo.verifyPassword(id, "newsecret")).toBe(true);
			expect(await repo.verifyPassword(id, "secret123")).toBe(false);
		});

		test("preserves optional fields when not provided in update", async () => {
			const { id } = await createVolunteer(
				{
					name: "Alice",
					phone: "07700900001",
					email: "alice@example.com",
					password: "secret123",
				},
				eventStore,
				credentialsStore,
			);
			await updateVolunteer(
				id,
				{ name: "Alicia" },
				eventStore,
				credentialsStore,
			);

			const found = await repo.getById(id);
			expect(found!.phone).toBe("07700900001");
			expect(found!.email).toBe("alice@example.com");
		});

		test("clears optional fields when set to null", async () => {
			const { id } = await createVolunteer(
				{
					name: "Alice",
					phone: "07700900001",
					email: "alice@example.com",
					password: "secret123",
				},
				eventStore,
				credentialsStore,
			);
			await updateVolunteer(
				id,
				{ phone: null, email: null },
				eventStore,
				credentialsStore,
			);

			const found = await repo.getById(id);
			expect(found!.phone).toBeUndefined();
			expect(found!.email).toBeUndefined();
		});
	});

	describe("disable/enable", () => {
		test("disables a volunteer", async () => {
			const { id } = await createVolunteer(
				{ name: "Alice", password: "secret123" },
				eventStore,
				credentialsStore,
			);
			await disableVolunteer(id, eventStore);
			const found = await repo.getById(id);

			expect(found).not.toBeNull();
			expect(found!.isDisabled).toBe(true);
		});

		test("enables a disabled volunteer", async () => {
			const { id } = await createVolunteer(
				{ name: "Alice", password: "secret123" },
				eventStore,
				credentialsStore,
			);
			await disableVolunteer(id, eventStore);
			await enableVolunteer(id, eventStore);
			const found = await repo.getById(id);

			expect(found).not.toBeNull();
			expect(found!.isDisabled).toBe(false);
		});
	});

	describe("verifyPassword", () => {
		test("returns true for correct password", async () => {
			const { id } = await createVolunteer(
				{ name: "Alice", password: "secret123" },
				eventStore,
				credentialsStore,
			);

			expect(await repo.verifyPassword(id, "secret123")).toBe(true);
		});

		test("returns false for wrong password", async () => {
			const { id } = await createVolunteer(
				{ name: "Alice", password: "secret123" },
				eventStore,
				credentialsStore,
			);

			expect(await repo.verifyPassword(id, "wrongpassword")).toBe(false);
		});

		test("returns false for unknown id", async () => {
			expect(await repo.verifyPassword("nonexistent", "secret123")).toBe(false);
		});
	});
});
