import { describe, expect, it } from "bun:test";
import { IllegalStateError } from "@event-driven-io/emmett";
import { decide, evolve, initialState } from "./decider.ts";
import type { VolunteerState } from "./types.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-02-01T00:00:00.000Z";

const activeState: VolunteerState = {
	status: "active",
	id: "vol-1",
	name: "Alice",
	isAdmin: false,
	requiresPasswordReset: false,
	createdAt: NOW,
	updatedAt: NOW,
};

const disabledState: VolunteerState = {
	...activeState,
	status: "disabled",
};

describe("volunteer decider", () => {
	describe("CreateVolunteer", () => {
		it("emits VolunteerCreated on initial state", () => {
			const events = decide(
				{
					type: "CreateVolunteer",
					data: {
						id: "vol-1",
						name: "Alice",
						createdAt: NOW,
					},
				},
				initialState(),
			);

			expect(events).toHaveLength(1);
			expect(events[0]?.type).toBe("VolunteerCreated");
			expect(events[0]?.data).toMatchObject({ name: "Alice", id: "vol-1" });
		});

		it("throws when volunteer already exists (active)", () => {
			expect(() =>
				decide(
					{
						type: "CreateVolunteer",
						data: {
							id: "vol-1",
							name: "Alice",
							createdAt: NOW,
						},
					},
					activeState,
				),
			).toThrow(IllegalStateError);
		});

		it("throws when volunteer exists in disabled state", () => {
			expect(() =>
				decide(
					{
						type: "CreateVolunteer",
						data: {
							id: "vol-1",
							name: "Alice",
							createdAt: NOW,
						},
					},
					disabledState,
				),
			).toThrow(IllegalStateError);
		});
	});

	describe("UpdateVolunteer", () => {
		it("emits VolunteerUpdated on active state", () => {
			const events = decide(
				{
					type: "UpdateVolunteer",
					data: {
						id: "vol-1",
						name: "Alice Updated",
						updatedAt: LATER,
					},
				},
				activeState,
			);

			expect(events).toHaveLength(1);
			expect(events[0]?.type).toBe("VolunteerUpdated");
		});

		it("throws on initial state", () => {
			expect(() =>
				decide(
					{
						type: "UpdateVolunteer",
						data: {
							id: "vol-1",
							name: "Alice",
							updatedAt: LATER,
						},
					},
					initialState(),
				),
			).toThrow(IllegalStateError);
		});

		it("throws on disabled state", () => {
			expect(() =>
				decide(
					{
						type: "UpdateVolunteer",
						data: {
							id: "vol-1",
							name: "Alice",
							updatedAt: LATER,
						},
					},
					disabledState,
				),
			).toThrow(IllegalStateError);
		});
	});

	describe("DisableVolunteer", () => {
		it("emits VolunteerDisabled on active state", () => {
			const events = decide(
				{
					type: "DisableVolunteer",
					data: { id: "vol-1", disabledAt: LATER },
				},
				activeState,
			);

			expect(events).toHaveLength(1);
			expect(events[0]?.type).toBe("VolunteerDisabled");
		});

		it("throws when already disabled", () => {
			expect(() =>
				decide(
					{
						type: "DisableVolunteer",
						data: { id: "vol-1", disabledAt: LATER },
					},
					disabledState,
				),
			).toThrow(IllegalStateError);
		});

		it("throws on initial state", () => {
			expect(() =>
				decide(
					{
						type: "DisableVolunteer",
						data: { id: "vol-1", disabledAt: LATER },
					},
					initialState(),
				),
			).toThrow(IllegalStateError);
		});
	});

	describe("EnableVolunteer", () => {
		it("emits VolunteerEnabled on disabled state", () => {
			const events = decide(
				{
					type: "EnableVolunteer",
					data: { id: "vol-1", enabledAt: LATER },
				},
				disabledState,
			);

			expect(events).toHaveLength(1);
			expect(events[0]?.type).toBe("VolunteerEnabled");
		});

		it("throws when active (not disabled)", () => {
			expect(() =>
				decide(
					{
						type: "EnableVolunteer",
						data: { id: "vol-1", enabledAt: LATER },
					},
					activeState,
				),
			).toThrow(IllegalStateError);
		});
	});

	describe("ChangePassword", () => {
		it("emits PasswordChanged on active state", () => {
			const events = decide(
				{
					type: "ChangePassword",
					data: { id: "vol-1", changedAt: LATER },
				},
				activeState,
			);

			expect(events).toHaveLength(1);
			expect(events[0]?.type).toBe("PasswordChanged");
		});

		it("throws on disabled state", () => {
			expect(() =>
				decide(
					{
						type: "ChangePassword",
						data: { id: "vol-1", changedAt: LATER },
					},
					disabledState,
				),
			).toThrow(IllegalStateError);
		});

		it("throws on initial state", () => {
			expect(() =>
				decide(
					{
						type: "ChangePassword",
						data: { id: "vol-1", changedAt: LATER },
					},
					initialState(),
				),
			).toThrow(IllegalStateError);
		});
	});

	describe("evolve", () => {
		it("transitions to active after VolunteerCreated", () => {
			const state = evolve(initialState(), {
				type: "VolunteerCreated",
				data: {
					id: "vol-1",
					name: "Alice",
					isAdmin: true,
					requiresPasswordReset: true,
					createdAt: NOW,
				},
			});

			expect(state.status).toBe("active");
			if (state.status === "active" || state.status === "disabled") {
				expect(state.isAdmin).toBe(true);
				expect(state.requiresPasswordReset).toBe(true);
			}
		});

		it("defaults isAdmin and requiresPasswordReset to false", () => {
			const state = evolve(initialState(), {
				type: "VolunteerCreated",
				data: {
					id: "vol-1",
					name: "Alice",
					createdAt: NOW,
				},
			});

			if (state.status === "active" || state.status === "disabled") {
				expect(state.isAdmin).toBe(false);
				expect(state.requiresPasswordReset).toBe(false);
			}
		});

		it("transitions to disabled after VolunteerDisabled", () => {
			const state = evolve(activeState, {
				type: "VolunteerDisabled",
				data: { id: "vol-1", disabledAt: LATER },
			});

			expect(state.status).toBe("disabled");
		});

		it("transitions back to active after VolunteerEnabled", () => {
			const state = evolve(disabledState, {
				type: "VolunteerEnabled",
				data: { id: "vol-1", enabledAt: LATER },
			});

			expect(state.status).toBe("active");
		});

		it("clears requiresPasswordReset after PasswordChanged", () => {
			const stateWithReset: VolunteerState = {
				...activeState,
				requiresPasswordReset: true,
			};
			const state = evolve(stateWithReset, {
				type: "PasswordChanged",
				data: { id: "vol-1", changedAt: LATER },
			});

			if (state.status === "active" || state.status === "disabled") {
				expect(state.requiresPasswordReset).toBe(false);
			}
		});
	});
});
