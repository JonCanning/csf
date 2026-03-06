import { sqliteProjection } from "@event-driven-io/emmett-sqlite";
import type { VolunteerEvent } from "../../domain/volunteer/types.ts";

export const volunteerProjection = sqliteProjection<VolunteerEvent>({
	canHandle: ["VolunteerCreated", "VolunteerUpdated", "VolunteerDeleted"],

	init: async ({ context: { connection } }) => {
		await connection.command(`
			CREATE TABLE IF NOT EXISTS volunteers (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				phone TEXT,
				email TEXT,
				password_hash TEXT NOT NULL,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			)
		`);
	},

	handle: async (events, { connection }) => {
		for (const event of events) {
			switch (event.type) {
				case "VolunteerCreated": {
					const d = event.data;
					await connection.command(
						`INSERT INTO volunteers (id, name, phone, email, password_hash, created_at, updated_at)
						 VALUES (?, ?, ?, ?, ?, ?, ?)`,
						[
							d.id,
							d.name,
							d.phone ?? null,
							d.email ?? null,
							d.passwordHash,
							d.createdAt,
							d.createdAt,
						],
					);
					break;
				}
				case "VolunteerUpdated": {
					const d = event.data;
					await connection.command(
						`UPDATE volunteers SET
							name = ?, phone = ?, email = ?, password_hash = ?, updated_at = ?
						WHERE id = ?`,
						[
							d.name,
							d.phone ?? null,
							d.email ?? null,
							d.passwordHash,
							d.updatedAt,
							d.id,
						],
					);
					break;
				}
				case "VolunteerDeleted": {
					await connection.command("DELETE FROM volunteers WHERE id = ?", [
						event.data.id,
					]);
					break;
				}
			}
		}
	},
});
