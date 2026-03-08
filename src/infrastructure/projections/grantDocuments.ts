import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";

export type GrantDocument = {
	id: string;
	grantId: string;
	type: string;
	data: Buffer;
	mimeType: string;
	uploadedAt: string;
};

type DbRow = {
	id: string;
	grant_id: string;
	type: string;
	data: Buffer;
	mime_type: string;
	uploaded_at: string;
};

export function GrantDocumentStore(
	pool: ReturnType<typeof SQLiteConnectionPool>,
) {
	return {
		async init(): Promise<void> {
			await pool.withConnection(async (conn) => {
				await conn.command(`
					CREATE TABLE IF NOT EXISTS grant_documents (
						id TEXT PRIMARY KEY,
						grant_id TEXT NOT NULL,
						type TEXT NOT NULL,
						data BLOB NOT NULL,
						mime_type TEXT NOT NULL,
						uploaded_at TEXT NOT NULL
					)
				`);
			});
		},

		async store(doc: {
			id: string;
			grantId: string;
			type: string;
			data: Buffer;
			mimeType: string;
		}): Promise<void> {
			const now = new Date().toISOString();
			await pool.withConnection(async (conn) => {
				await conn.command(
					`INSERT INTO grant_documents (id, grant_id, type, data, mime_type, uploaded_at)
					 VALUES (?, ?, ?, ?, ?, ?)`,
					[doc.id, doc.grantId, doc.type, doc.data, doc.mimeType, now],
				);
			});
		},

		async getById(id: string): Promise<GrantDocument | null> {
			try {
				return await pool.withConnection(async (conn) => {
					const rows = await conn.query<DbRow>(
						"SELECT * FROM grant_documents WHERE id = ?",
						[id],
					);
					const row = rows[0];
					if (!row) return null;
					return {
						id: row.id,
						grantId: row.grant_id,
						type: row.type,
						data: row.data,
						mimeType: row.mime_type,
						uploadedAt: row.uploaded_at,
					};
				});
			} catch {
				return null;
			}
		},

		async getByGrantId(grantId: string): Promise<GrantDocument[]> {
			try {
				return await pool.withConnection(async (conn) => {
					const rows = await conn.query<DbRow>(
						"SELECT * FROM grant_documents WHERE grant_id = ? ORDER BY uploaded_at DESC",
						[grantId],
					);
					return rows.map((row) => ({
						id: row.id,
						grantId: row.grant_id,
						type: row.type,
						data: row.data,
						mimeType: row.mime_type,
						uploadedAt: row.uploaded_at,
					}));
				});
			} catch {
				return [];
			}
		},
	};
}
