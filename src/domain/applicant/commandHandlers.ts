import { CommandHandler, IllegalStateError } from "@event-driven-io/emmett";
import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import { toApplicantId } from "../application/applicantId.ts";
import { decide, evolve, initialState } from "./decider.ts";
import type {
	ApplicantEvent,
	ApplicantState,
	CreateApplicant,
	UpdateApplicant,
} from "./types.ts";

const handle = CommandHandler<ReturnType<typeof initialState>, ApplicantEvent>({
	evolve,
	initialState,
});

function streamId(id: string): string {
	return `applicant-${id}`;
}

export async function createApplicant(
	data: CreateApplicant & { applicationId?: string },
	eventStore: SQLiteEventStore,
): Promise<{ id: string }> {
	const id = toApplicantId(data.phone, data.name);
	const now = new Date().toISOString();

	await handle(eventStore, streamId(id), (_state) =>
		decide(
			{
				type: "CreateApplicant",
				data: {
					id,
					volunteerId: data.volunteerId,
					phone: data.phone,
					name: data.name,
					email: data.email,
					createdAt: now,
				},
			},
			initialState(),
		),
	);

	return { id };
}

export async function updateApplicant(
	id: string,
	volunteerId: string,
	data: UpdateApplicant,
	eventStore: SQLiteEventStore,
): Promise<void> {
	const now = new Date().toISOString();

	await handle(eventStore, streamId(id), (state: ApplicantState) => {
		if (state.status !== "active") {
			throw new IllegalStateError(
				`Cannot update applicant in ${state.status} state`,
			);
		}

		const merged = {
			id,
			volunteerId,
			phone: data.phone ?? state.phone,
			name: data.name ?? state.name,
			email: data.email === null ? undefined : (data.email ?? state.email),
			updatedAt: now,
		};

		return decide({ type: "UpdateApplicant", data: merged }, state);
	});
}

export async function deleteApplicant(
	id: string,
	volunteerId: string,
	eventStore: SQLiteEventStore,
): Promise<void> {
	const now = new Date().toISOString();

	await handle(eventStore, streamId(id), (state) =>
		decide(
			{ type: "DeleteApplicant", data: { id, volunteerId, deletedAt: now } },
			state,
		),
	);
}
