import { describe, expect, test } from "bun:test";
import { IllegalStateError } from "@event-driven-io/emmett";
import {
	decide,
	evolve,
	initialState,
} from "../../src/domain/volunteer/decider.ts";
import type {
	VolunteerCommand,
	VolunteerEvent,
	VolunteerState,
} from "../../src/domain/volunteer/types.ts";

const createCommand: VolunteerCommand = {
	type: "CreateVolunteer",
	data: {
		id: "v-1",
		name: "Alice",
		phone: "07700900001",
		email: "alice@example.com",
		passwordHash: "$argon2id$hashed",
		createdAt: "2026-01-01T00:00:00.000Z",
	},
};

const activeState: VolunteerState = {
	status: "active",
	id: "v-1",
	name: "Alice",
	phone: "07700900001",
	email: "alice@example.com",
	passwordHash: "$argon2id$hashed",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("volunteer decider", () => {
	describe("decide", () => {
		test("CreateVolunteer emits VolunteerCreated from initial state", () => {
			const events = decide(createCommand, initialState());
			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe("VolunteerCreated");
			expect(events[0]!.data.name).toBe("Alice");
		});

		test("CreateVolunteer rejects if already exists", () => {
			expect(() => decide(createCommand, activeState)).toThrow(
				IllegalStateError,
			);
		});

		test("UpdateVolunteer emits VolunteerUpdated from active state", () => {
			const cmd: VolunteerCommand = {
				type: "UpdateVolunteer",
				data: {
					id: "v-1",
					name: "Alicia",
					phone: "07700900001",
					email: "alice@example.com",
					passwordHash: "$argon2id$hashed",
					updatedAt: "2026-01-02T00:00:00.000Z",
				},
			};
			const events = decide(cmd, activeState);
			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe("VolunteerUpdated");
			expect(events[0]!.data.name).toBe("Alicia");
		});

		test("UpdateVolunteer rejects from initial state", () => {
			const cmd: VolunteerCommand = {
				type: "UpdateVolunteer",
				data: {
					id: "v-1",
					name: "Alicia",
					passwordHash: "$argon2id$hashed",
					updatedAt: "2026-01-02T00:00:00.000Z",
				},
			};
			expect(() => decide(cmd, initialState())).toThrow(IllegalStateError);
		});

		test("DeleteVolunteer emits VolunteerDeleted from active state", () => {
			const cmd: VolunteerCommand = {
				type: "DeleteVolunteer",
				data: { id: "v-1", deletedAt: "2026-01-03T00:00:00.000Z" },
			};
			const events = decide(cmd, activeState);
			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe("VolunteerDeleted");
		});

		test("DeleteVolunteer rejects from initial state", () => {
			const cmd: VolunteerCommand = {
				type: "DeleteVolunteer",
				data: { id: "v-1", deletedAt: "2026-01-03T00:00:00.000Z" },
			};
			expect(() => decide(cmd, initialState())).toThrow(IllegalStateError);
		});

		test("DeleteVolunteer rejects from deleted state", () => {
			const cmd: VolunteerCommand = {
				type: "DeleteVolunteer",
				data: { id: "v-1", deletedAt: "2026-01-03T00:00:00.000Z" },
			};
			expect(() => decide(cmd, { status: "deleted" })).toThrow(
				IllegalStateError,
			);
		});
	});

	describe("evolve", () => {
		test("VolunteerCreated transitions to active", () => {
			const event: VolunteerEvent = {
				type: "VolunteerCreated",
				data: createCommand.data,
			};
			const state = evolve(initialState(), event);
			expect(state.status).toBe("active");
			if (state.status === "active") {
				expect(state.name).toBe("Alice");
				expect(state.phone).toBe("07700900001");
				expect(state.passwordHash).toBe("$argon2id$hashed");
				expect(state.createdAt).toBe("2026-01-01T00:00:00.000Z");
				expect(state.updatedAt).toBe("2026-01-01T00:00:00.000Z");
			}
		});

		test("VolunteerUpdated updates active state", () => {
			const event: VolunteerEvent = {
				type: "VolunteerUpdated",
				data: {
					id: "v-1",
					name: "Alicia",
					passwordHash: "$argon2id$newhash",
					updatedAt: "2026-01-02T00:00:00.000Z",
				},
			};
			const state = evolve(activeState, event);
			expect(state.status).toBe("active");
			if (state.status === "active") {
				expect(state.name).toBe("Alicia");
				expect(state.passwordHash).toBe("$argon2id$newhash");
				expect(state.createdAt).toBe("2026-01-01T00:00:00.000Z");
				expect(state.updatedAt).toBe("2026-01-02T00:00:00.000Z");
			}
		});

		test("VolunteerDeleted transitions to deleted", () => {
			const event: VolunteerEvent = {
				type: "VolunteerDeleted",
				data: { id: "v-1", deletedAt: "2026-01-03T00:00:00.000Z" },
			};
			const state = evolve(activeState, event);
			expect(state.status).toBe("deleted");
		});
	});
});
