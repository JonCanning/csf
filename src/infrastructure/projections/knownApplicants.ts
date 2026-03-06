import { sqliteProjection } from "@event-driven-io/emmett-sqlite";
import type {
	ApplicationEvent,
	ApplicationEventType,
} from "../../domain/application/types.ts";

export const knownApplicantsProjection = sqliteProjection<ApplicationEvent>({
	canHandle: ["ApplicationSubmitted" satisfies ApplicationEventType],

	init: async ({ context: { connection } }) => {
		await connection.command(`
      CREATE TABLE IF NOT EXISTS known_applicants (
        phone TEXT PRIMARY KEY,
        applicant_id TEXT NOT NULL,
        name TEXT NOT NULL
      )
    `);
	},

	handle: async (events, { connection }) => {
		for (const { type, data } of events) {
			if (type !== "ApplicationSubmitted") continue;
			await connection.command(
				`INSERT OR IGNORE INTO known_applicants (phone, applicant_id, name)
         VALUES (?, ?, ?)`,
				[data.identity.phone, data.applicantId, data.identity.name],
			);
		}
	},
});
