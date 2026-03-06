import { sqliteProjection } from "@event-driven-io/emmett-sqlite";
import type { RecipientEvent } from "../../domain/recipient/types.ts";

export const recipientProjection = sqliteProjection<RecipientEvent>({
	canHandle: ["RecipientCreated", "RecipientUpdated", "RecipientDeleted"],

	init: async ({ context: { connection } }) => {
		await connection.command(`
			CREATE TABLE IF NOT EXISTS recipients (
				id TEXT PRIMARY KEY,
				phone TEXT NOT NULL UNIQUE,
				name TEXT NOT NULL,
				email TEXT,
				payment_preference TEXT NOT NULL DEFAULT 'cash',
				meeting_place TEXT,
				bank_sort_code TEXT,
				bank_account_number TEXT,
				notes TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			)
		`);
	},

	handle: async (events, { connection }) => {
		for (const event of events) {
			switch (event.type) {
				case "RecipientCreated": {
					const d = event.data;
					await connection.command(
						`INSERT INTO recipients (id, phone, name, email, payment_preference, meeting_place, bank_sort_code, bank_account_number, notes, created_at, updated_at)
						 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
						[
							d.id,
							d.phone,
							d.name,
							d.email ?? null,
							d.paymentPreference,
							d.meetingPlace ?? null,
							d.bankDetails?.sortCode ?? null,
							d.bankDetails?.accountNumber ?? null,
							d.notes ?? null,
							d.createdAt,
							d.createdAt,
						],
					);
					break;
				}
				case "RecipientUpdated": {
					const d = event.data;
					await connection.command(
						`UPDATE recipients SET
							phone = ?, name = ?, email = ?, payment_preference = ?,
							meeting_place = ?, bank_sort_code = ?, bank_account_number = ?,
							notes = ?, updated_at = ?
						WHERE id = ?`,
						[
							d.phone,
							d.name,
							d.email ?? null,
							d.paymentPreference,
							d.meetingPlace ?? null,
							d.bankDetails?.sortCode ?? null,
							d.bankDetails?.accountNumber ?? null,
							d.notes ?? null,
							d.updatedAt,
							d.id,
						],
					);
					break;
				}
				case "RecipientDeleted": {
					await connection.command("DELETE FROM recipients WHERE id = ?", [
						event.data.id,
					]);
					break;
				}
			}
		}
	},
});
