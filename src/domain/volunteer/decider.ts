import { IllegalStateError } from "@event-driven-io/emmett";
import type {
	VolunteerCommand,
	VolunteerEvent,
	VolunteerState,
} from "./types.ts";

export const initialState = (): VolunteerState => ({ status: "initial" });

export function decide(
	command: VolunteerCommand,
	state: VolunteerState,
): VolunteerEvent[] {
	switch (command.type) {
		case "CreateVolunteer": {
			if (state.status !== "initial") {
				throw new IllegalStateError("Volunteer already exists");
			}
			return [
				{
					type: "VolunteerCreated",
					data: command.data,
				},
			];
		}
		case "UpdateVolunteer": {
			if (state.status !== "active") {
				throw new IllegalStateError(
					`Cannot update volunteer in ${state.status} state`,
				);
			}
			return [
				{
					type: "VolunteerUpdated",
					data: command.data,
				},
			];
		}
		case "DisableVolunteer": {
			if (state.status !== "active") {
				throw new IllegalStateError(
					`Cannot disable volunteer in ${state.status} state`,
				);
			}
			return [
				{
					type: "VolunteerDisabled",
					data: command.data,
				},
			];
		}
		case "EnableVolunteer": {
			if (state.status !== "disabled") {
				throw new IllegalStateError(
					`Cannot enable volunteer in ${state.status} state`,
				);
			}
			return [
				{
					type: "VolunteerEnabled",
					data: command.data,
				},
			];
		}
		case "ChangePassword": {
			if (state.status !== "active") {
				throw new IllegalStateError(
					`Cannot change password in ${state.status} state`,
				);
			}
			return [
				{
					type: "PasswordChanged",
					data: command.data,
				},
			];
		}
	}
}

export function evolve(
	state: VolunteerState,
	event: VolunteerEvent,
): VolunteerState {
	switch (event.type) {
		case "VolunteerCreated":
			return {
				status: "active",
				id: event.data.id,
				name: event.data.name,
				phone: event.data.phone,
				email: event.data.email,
				passwordHash: event.data.passwordHash,
				isAdmin: event.data.isAdmin ?? false,
				requiresPasswordReset: event.data.requiresPasswordReset ?? false,
				createdAt: event.data.createdAt,
				updatedAt: event.data.createdAt,
			};
		case "VolunteerUpdated":
			if (state.status === "initial") return state;
			return {
				...state,
				name: event.data.name,
				phone: event.data.phone,
				email: event.data.email,
				passwordHash: event.data.passwordHash ?? state.passwordHash,
				isAdmin: event.data.isAdmin ?? state.isAdmin,
				updatedAt: event.data.updatedAt,
			};
		case "VolunteerDisabled":
			if (state.status === "initial") return state;
			return {
				...state,
				status: "disabled",
				updatedAt: event.data.disabledAt,
			};
		case "VolunteerEnabled":
			if (state.status === "initial") return state;
			return {
				...state,
				status: "active",
				updatedAt: event.data.enabledAt,
			};
		case "PasswordChanged":
			if (state.status === "initial") return state;
			return {
				...state,
				passwordHash: event.data.passwordHash,
				requiresPasswordReset: false,
				updatedAt: event.data.changedAt,
			};
		default: {
			const _exhaustive: never = event;
			return state;
		}
	}
}
