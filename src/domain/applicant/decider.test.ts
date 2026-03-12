import { describe, expect, it } from "bun:test";
import { IllegalStateError } from "@event-driven-io/emmett";
import { decide, evolve, initialState } from "./decider.ts";
import type { ApplicantState } from "./types.ts";

const NOW = "2026-01-01T00:00:00.000Z";

const activeState: ApplicantState = {
	status: "active",
	id: "applicant-07700900000-jane doe",
	phone: "07700900000",
	name: "Jane Doe",
	createdAt: NOW,
	updatedAt: NOW,
};

describe("applicant decider", () => {
	describe("CreateApplicant", () => {
		it("emits ApplicantCreated on initial state", () => {
			const events = decide(
				{
					type: "CreateApplicant",
					data: {
						id: "applicant-07700900000-jane doe",
						phone: "07700900000",
						name: "Jane Doe",
						createdAt: NOW,
					},
				},
				initialState(),
			);

			expect(events).toHaveLength(1);
			expect(events[0]?.type).toBe("ApplicantCreated");
			expect(events[0]?.data).toMatchObject({
				phone: "07700900000",
				name: "Jane Doe",
			});
		});

		it("throws when applicant already exists (active state)", () => {
			expect(() =>
				decide(
					{
						type: "CreateApplicant",
						data: {
							id: "applicant-07700900000-jane doe",
							phone: "07700900000",
							name: "Jane Doe",
							createdAt: NOW,
						},
					},
					activeState,
				),
			).toThrow(IllegalStateError);
		});

		it("throws when applicant is in deleted state", () => {
			expect(() =>
				decide(
					{
						type: "CreateApplicant",
						data: {
							id: "applicant-07700900000-jane doe",
							phone: "07700900000",
							name: "Jane Doe",
							createdAt: NOW,
						},
					},
					{ status: "deleted" },
				),
			).toThrow(IllegalStateError);
		});
	});

	describe("UpdateApplicant", () => {
		it("emits ApplicantUpdated on active state", () => {
			const events = decide(
				{
					type: "UpdateApplicant",
					data: {
						id: "applicant-07700900000-jane doe",
						volunteerId: "vol-1",
						phone: "07700900001",
						name: "Jane Smith",
						updatedAt: NOW,
					},
				},
				activeState,
			);

			expect(events).toHaveLength(1);
			expect(events[0]?.type).toBe("ApplicantUpdated");
			expect(events[0]?.data).toMatchObject({
				phone: "07700900001",
				name: "Jane Smith",
			});
		});

		it("throws on initial state", () => {
			expect(() =>
				decide(
					{
						type: "UpdateApplicant",
						data: {
							id: "applicant-07700900000-jane doe",
							volunteerId: "vol-1",
							phone: "07700900000",
							name: "Jane Doe",
							updatedAt: NOW,
						},
					},
					initialState(),
				),
			).toThrow(IllegalStateError);
		});

		it("throws on deleted state", () => {
			expect(() =>
				decide(
					{
						type: "UpdateApplicant",
						data: {
							id: "applicant-07700900000-jane doe",
							volunteerId: "vol-1",
							phone: "07700900000",
							name: "Jane Doe",
							updatedAt: NOW,
						},
					},
					{ status: "deleted" },
				),
			).toThrow(IllegalStateError);
		});
	});

	describe("DeleteApplicant", () => {
		it("emits ApplicantDeleted on active state", () => {
			const events = decide(
				{
					type: "DeleteApplicant",
					data: {
						id: "applicant-07700900000-jane doe",
						volunteerId: "vol-1",
						deletedAt: NOW,
					},
				},
				activeState,
			);

			expect(events).toHaveLength(1);
			expect(events[0]?.type).toBe("ApplicantDeleted");
		});

		it("throws on initial state", () => {
			expect(() =>
				decide(
					{
						type: "DeleteApplicant",
						data: {
							id: "applicant-07700900000-jane doe",
							volunteerId: "vol-1",
							deletedAt: NOW,
						},
					},
					initialState(),
				),
			).toThrow(IllegalStateError);
		});
	});

	describe("evolve", () => {
		it("transitions to active after ApplicantCreated", () => {
			const state = evolve(initialState(), {
				type: "ApplicantCreated",
				data: {
					id: "applicant-07700900000-jane doe",
					phone: "07700900000",
					name: "Jane Doe",
					createdAt: NOW,
				},
			});

			expect(state.status).toBe("active");
			if (state.status === "active") {
				expect(state.phone).toBe("07700900000");
				expect(state.createdAt).toBe(NOW);
				expect(state.updatedAt).toBe(NOW);
			}
		});

		it("transitions to deleted after ApplicantDeleted", () => {
			const state = evolve(activeState, {
				type: "ApplicantDeleted",
				data: {
					id: "applicant-07700900000-jane doe",
					volunteerId: "vol-1",
					deletedAt: NOW,
				},
			});

			expect(state.status).toBe("deleted");
		});

		it("updates fields after ApplicantUpdated", () => {
			const LATER = "2026-02-01T00:00:00.000Z";
			const state = evolve(activeState, {
				type: "ApplicantUpdated",
				data: {
					id: "applicant-07700900000-jane doe",
					volunteerId: "vol-1",
					phone: "07700900099",
					name: "Jane Smith",
					updatedAt: LATER,
				},
			});

			expect(state.status).toBe("active");
			if (state.status === "active") {
				expect(state.phone).toBe("07700900099");
				expect(state.name).toBe("Jane Smith");
				expect(state.updatedAt).toBe(LATER);
				expect(state.createdAt).toBe(NOW);
			}
		});
	});
});
