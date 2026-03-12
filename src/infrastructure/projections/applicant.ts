import { sqliteProjection } from "@event-driven-io/emmett-sqlite";
import type { ApplicantEvent } from "../../domain/applicant/types.ts";

export const applicantProjection = sqliteProjection<ApplicantEvent>({
	canHandle: ["ApplicantCreated", "ApplicantUpdated", "ApplicantDeleted"],

	init: async ({ context: { connection } }) => {
		await connection.command(`
			CREATE TABLE IF NOT EXISTS applicants (
				id TEXT PRIMARY KEY,
				phone TEXT NOT NULL,
				name TEXT NOT NULL,
				email TEXT,
				notes TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			)
		`);
	},

	handle: async (events, { connection }) => {
		for (const event of events) {
			switch (event.type) {
				case "ApplicantCreated": {
					const d = event.data;
					await connection.command(
						`INSERT INTO applicants (id, phone, name, email, created_at, updated_at)
						 VALUES (?, ?, ?, ?, ?, ?)`,
						[d.id, d.phone, d.name, d.email ?? null, d.createdAt, d.createdAt],
					);
					break;
				}
				case "ApplicantUpdated": {
					const d = event.data;
					await connection.command(
						`UPDATE applicants SET
							phone = ?, name = ?, email = ?, updated_at = ?
						WHERE id = ?`,
						[d.phone, d.name, d.email ?? null, d.updatedAt, d.id],
					);
					break;
				}
				case "ApplicantDeleted": {
					await connection.command("DELETE FROM applicants WHERE id = ?", [
						event.data.id,
					]);
					break;
				}
			}
		}
	},
});
