import { IllegalStateError } from "@event-driven-io/emmett";
import type {
	RecipientCommand,
	RecipientEvent,
	RecipientState,
} from "./types.ts";

export const initialState = (): RecipientState => ({ status: "initial" });

export function decide(
	command: RecipientCommand,
	state: RecipientState,
): RecipientEvent[] {
	switch (command.type) {
		case "CreateRecipient": {
			if (state.status !== "initial") {
				throw new IllegalStateError("Recipient already exists");
			}
			return [
				{
					type: "RecipientCreated",
					data: command.data,
				},
			];
		}
		case "UpdateRecipient": {
			if (state.status !== "active") {
				throw new IllegalStateError(
					`Cannot update recipient in ${state.status} state`,
				);
			}
			return [
				{
					type: "RecipientUpdated",
					data: command.data,
				},
			];
		}
		case "DeleteRecipient": {
			if (state.status !== "active") {
				throw new IllegalStateError(
					`Cannot delete recipient in ${state.status} state`,
				);
			}
			return [
				{
					type: "RecipientDeleted",
					data: command.data,
				},
			];
		}
	}
}

export function evolve(
	state: RecipientState,
	event: RecipientEvent,
): RecipientState {
	switch (event.type) {
		case "RecipientCreated":
			return {
				status: "active",
				id: event.data.id,
				phone: event.data.phone,
				name: event.data.name,
				email: event.data.email,
				paymentPreference: event.data.paymentPreference,
				meetingPlace: event.data.meetingPlace,
				bankDetails: event.data.bankDetails,
				notes: event.data.notes,
				createdAt: event.data.createdAt,
				updatedAt: event.data.createdAt,
			};
		case "RecipientUpdated":
			if (state.status !== "active") return state;
			return {
				status: "active",
				id: event.data.id,
				phone: event.data.phone,
				name: event.data.name,
				email: event.data.email,
				paymentPreference: event.data.paymentPreference,
				meetingPlace: event.data.meetingPlace,
				bankDetails: event.data.bankDetails,
				notes: event.data.notes,
				createdAt: state.createdAt,
				updatedAt: event.data.updatedAt,
			};
		case "RecipientDeleted":
			return { status: "deleted" };
		default: {
			const _exhaustive: never = event;
			return state;
		}
	}
}
