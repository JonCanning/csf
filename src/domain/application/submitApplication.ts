import { CommandHandler } from "@event-driven-io/emmett";
import type {
	SQLiteConnection,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { decide, evolve, initialState } from "./decider.ts";
import { resolveIdentity } from "./resolveIdentity.ts";
import type {
	ApplicationEvent,
	EligibilityResult,
	PaymentPreference,
	SubmitApplication,
} from "./types.ts";

export type ApplicationFormData = {
	applicationId: string;
	phone: string;
	name: string;
	email?: string;
	paymentPreference: PaymentPreference;
	meetingPlace: string;
	monthCycle: string;
	eligibility: EligibilityResult;
};

const handle = CommandHandler<
	ReturnType<typeof initialState>,
	ApplicationEvent
>({ evolve, initialState });

export async function submitApplication(
	form: ApplicationFormData,
	eventStore: SQLiteEventStore,
	pool: {
		withConnection: <T>(
			fn: (conn: SQLiteConnection) => Promise<T>,
		) => Promise<T>;
	},
): Promise<{ streamId: string; events: ApplicationEvent[] }> {
	const identityResolution = await pool.withConnection((conn) =>
		resolveIdentity(form.phone, form.name, conn),
	);

	const command: SubmitApplication = {
		type: "SubmitApplication",
		data: {
			applicationId: form.applicationId,
			identity: {
				phone: form.phone,
				name: form.name,
				email: form.email,
			},
			paymentPreference: form.paymentPreference,
			meetingDetails: { place: form.meetingPlace },
			monthCycle: form.monthCycle,
			identityResolution,
			eligibility: form.eligibility,
			submittedAt: new Date().toISOString(),
		},
	};

	const streamId = `application-${form.applicationId}`;
	const { newEvents } = await handle(eventStore, streamId, (state) =>
		decide(command, state),
	);

	return { streamId, events: newEvents as ApplicationEvent[] };
}
