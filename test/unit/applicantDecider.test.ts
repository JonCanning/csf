import { describe, expect, test } from "bun:test";
import { IllegalStateError } from "@event-driven-io/emmett";
import {
	decide,
	evolve,
	initialState,
} from "../../src/domain/applicant/decider.ts";
import type {
	ApplicantCommand,
	ApplicantEvent,
	ApplicantState,
} from "../../src/domain/applicant/types.ts";

const createCommand: ApplicantCommand = {
	type: "CreateApplicant",
	data: {
		id: "a-1",
		phone: "07700900001",
		name: "Alice",
		email: "alice@example.com",
		createdAt: "2026-01-01T00:00:00.000Z",
	},
};

const activeState: ApplicantState = {
	status: "active",
	id: "a-1",
	phone: "07700900001",
	name: "Alice",
	email: "alice@example.com",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("applicant decider", () => {
	describe("decide", () => {
		test("CreateApplicant emits ApplicantCreated from initial state", () => {
			const events = decide(createCommand, initialState());
			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe("ApplicantCreated");
			expect(events[0]!.data.phone).toBe("07700900001");
		});

		test("CreateApplicant rejects if already exists", () => {
			expect(() => decide(createCommand, activeState)).toThrow(
				IllegalStateError,
			);
		});

		test("UpdateApplicant emits ApplicantUpdated from active state", () => {
			const cmd: ApplicantCommand = {
				type: "UpdateApplicant",
				data: {
					id: "a-1",
					phone: "07700900002",
					name: "Alicia",
					updatedAt: "2026-01-02T00:00:00.000Z",
				},
			};
			const events = decide(cmd, activeState);
			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe("ApplicantUpdated");
			expect(events[0]!.data.name).toBe("Alicia");
		});

		test("UpdateApplicant rejects from initial state", () => {
			const cmd: ApplicantCommand = {
				type: "UpdateApplicant",
				data: {
					id: "a-1",
					phone: "07700900002",
					name: "Alicia",
					updatedAt: "2026-01-02T00:00:00.000Z",
				},
			};
			expect(() => decide(cmd, initialState())).toThrow(IllegalStateError);
		});

		test("DeleteApplicant emits ApplicantDeleted from active state", () => {
			const cmd: ApplicantCommand = {
				type: "DeleteApplicant",
				data: {
					id: "a-1",
					deletedAt: "2026-01-03T00:00:00.000Z",
				},
			};
			const events = decide(cmd, activeState);
			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe("ApplicantDeleted");
		});

		test("DeleteApplicant rejects from initial state", () => {
			const cmd: ApplicantCommand = {
				type: "DeleteApplicant",
				data: {
					id: "a-1",
					deletedAt: "2026-01-03T00:00:00.000Z",
				},
			};
			expect(() => decide(cmd, initialState())).toThrow(IllegalStateError);
		});

		test("DeleteApplicant rejects from deleted state", () => {
			const cmd: ApplicantCommand = {
				type: "DeleteApplicant",
				data: {
					id: "a-1",
					deletedAt: "2026-01-03T00:00:00.000Z",
				},
			};
			expect(() => decide(cmd, { status: "deleted" })).toThrow(
				IllegalStateError,
			);
		});
	});

	describe("evolve", () => {
		test("ApplicantCreated transitions to active", () => {
			const event: ApplicantEvent = {
				type: "ApplicantCreated",
				data: createCommand.data,
			};
			const state = evolve(initialState(), event);
			expect(state.status).toBe("active");
			if (state.status === "active") {
				expect(state.phone).toBe("07700900001");
				expect(state.name).toBe("Alice");
				expect(state.email).toBe("alice@example.com");
				expect(state.createdAt).toBe("2026-01-01T00:00:00.000Z");
				expect(state.updatedAt).toBe("2026-01-01T00:00:00.000Z");
			}
		});

		test("ApplicantUpdated updates fields and preserves createdAt", () => {
			const event: ApplicantEvent = {
				type: "ApplicantUpdated",
				data: {
					id: "a-1",
					phone: "07700900002",
					name: "Alicia",
					updatedAt: "2026-01-02T00:00:00.000Z",
				},
			};
			const state = evolve(activeState, event);
			expect(state.status).toBe("active");
			if (state.status === "active") {
				expect(state.name).toBe("Alicia");
				expect(state.phone).toBe("07700900002");
				expect(state.createdAt).toBe("2026-01-01T00:00:00.000Z");
				expect(state.updatedAt).toBe("2026-01-02T00:00:00.000Z");
			}
		});

		test("ApplicantDeleted transitions to deleted", () => {
			const event: ApplicantEvent = {
				type: "ApplicantDeleted",
				data: {
					id: "a-1",
					deletedAt: "2026-01-03T00:00:00.000Z",
				},
			};
			const state = evolve(activeState, event);
			expect(state.status).toBe("deleted");
		});
	});
});
