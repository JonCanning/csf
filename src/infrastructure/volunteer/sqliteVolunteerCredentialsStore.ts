import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import type { VolunteerCredentialsStore } from "../../domain/volunteer/repository.ts";
import { VOLUNTEER_CREDENTIALS_TABLE_DDL } from "./schema.ts";

export async function SQLiteVolunteerCredentialsStore(
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<VolunteerCredentialsStore> {
	await pool.withConnection(async (conn) => {
		await conn.command(VOLUNTEER_CREDENTIALS_TABLE_DDL);
		// Migrate existing hashes from the volunteers projection table if it exists
		const tableExists = await conn.query<{ cnt: number }>(
			`SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='volunteers'`,
		);
		if (tableExists[0]?.cnt) {
			await conn.command(`
				INSERT OR IGNORE INTO volunteer_credentials (volunteer_id, password_hash)
				SELECT id, password_hash FROM volunteers WHERE password_hash IS NOT NULL AND password_hash != ''
			`);
		}
	});

	return {
		async setPassword(volunteerId: string, hash: string): Promise<void> {
			await pool.withConnection(async (conn) => {
				await conn.command(
					`INSERT OR REPLACE INTO volunteer_credentials (volunteer_id, password_hash) VALUES (?, ?)`,
					[volunteerId, hash],
				);
			});
		},
	};
}
