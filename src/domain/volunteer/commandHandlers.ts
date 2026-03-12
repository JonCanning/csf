import { CommandHandler, IllegalStateError } from "@event-driven-io/emmett";
import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import { decide, evolve, initialState } from "./decider.ts";
import type { VolunteerCredentialsStore } from "./repository.ts";
import type {
	CreateVolunteer,
	UpdateVolunteer,
	VolunteerEvent,
	VolunteerState,
} from "./types.ts";

export async function changePassword(
	id: string,
	newPassword: string,
	eventStore: SQLiteEventStore,
	credentialsStore: VolunteerCredentialsStore,
): Promise<void> {
	const passwordHash = await Bun.password.hash(newPassword);
	const now = new Date().toISOString();
	await handle(eventStore, streamId(id), (state) =>
		decide({ type: "ChangePassword", data: { id, changedAt: now } }, state),
	);
	await credentialsStore.setPassword(id, passwordHash);
}

const handle = CommandHandler<ReturnType<typeof initialState>, VolunteerEvent>({
	evolve,
	initialState,
});

function streamId(id: string): string {
	return `volunteer-${id}`;
}

export async function createVolunteer(
	data: CreateVolunteer & { requiresPasswordReset?: boolean },
	eventStore: SQLiteEventStore,
	credentialsStore: VolunteerCredentialsStore,
): Promise<{ id: string }> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	const passwordHash = await Bun.password.hash(data.password);

	await handle(eventStore, streamId(id), (state) =>
		decide(
			{
				type: "CreateVolunteer",
				data: {
					id,
					name: data.name,
					phone: data.phone,
					email: data.email,
					isAdmin: data.isAdmin,
					requiresPasswordReset: data.requiresPasswordReset ?? true,
					createdAt: now,
				},
			},
			state,
		),
	);
	await credentialsStore.setPassword(id, passwordHash);

	return { id };
}

export async function updateVolunteer(
	id: string,
	data: UpdateVolunteer,
	eventStore: SQLiteEventStore,
	credentialsStore: VolunteerCredentialsStore,
): Promise<void> {
	const now = new Date().toISOString();

	await handle(eventStore, streamId(id), (state: VolunteerState) => {
		if (state.status !== "active") {
			throw new IllegalStateError(
				`Cannot update volunteer in ${state.status} state`,
			);
		}

		return decide(
			{
				type: "UpdateVolunteer",
				data: {
					id,
					name: data.name ?? state.name,
					phone: data.phone === null ? undefined : (data.phone ?? state.phone),
					email: data.email === null ? undefined : (data.email ?? state.email),
					isAdmin: data.isAdmin ?? state.isAdmin,
					updatedAt: now,
				},
			},
			state,
		);
	});

	if (data.password) {
		const passwordHash = await Bun.password.hash(data.password);
		await credentialsStore.setPassword(id, passwordHash);
	}
}

export async function disableVolunteer(
	id: string,
	eventStore: SQLiteEventStore,
): Promise<void> {
	const now = new Date().toISOString();

	await handle(eventStore, streamId(id), (state) =>
		decide({ type: "DisableVolunteer", data: { id, disabledAt: now } }, state),
	);
}

export async function enableVolunteer(
	id: string,
	eventStore: SQLiteEventStore,
): Promise<void> {
	const now = new Date().toISOString();

	await handle(eventStore, streamId(id), (state) =>
		decide({ type: "EnableVolunteer", data: { id, enabledAt: now } }, state),
	);
}
