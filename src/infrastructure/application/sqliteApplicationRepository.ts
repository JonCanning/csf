import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import type {
	ApplicationRepository,
	ApplicationRow,
} from "../../domain/application/repository.ts";

type DbRow = {
	id: string;
	applicant_id: string;
	month_cycle: string;
	status: string;
	rank: number | null;
	payment_preference: string;
	name: string | null;
	phone: string | null;
	reject_reason: string | null;
	applied_at: string | null;
	accepted_at: string | null;
	selected_at: string | null;
	rejected_at: string | null;
};

function isNoSuchTable(err: unknown): boolean {
	return err instanceof Error && err.message.includes("no such table");
}

function rowToApplication(row: DbRow): ApplicationRow {
	return {
		id: row.id,
		applicantId: row.applicant_id,
		monthCycle: row.month_cycle,
		status: row.status,
		rank: row.rank,
		paymentPreference: row.payment_preference,
		name: row.name,
		phone: row.phone,
		rejectReason: row.reject_reason,
		appliedAt: row.applied_at,
		acceptedAt: row.accepted_at,
		selectedAt: row.selected_at,
		rejectedAt: row.rejected_at,
	};
}

export function SQLiteApplicationRepository(
	pool: ReturnType<typeof SQLiteConnectionPool>,
): ApplicationRepository {
	return {
		async getById(id: string): Promise<ApplicationRow | null> {
			try {
				return await pool.withConnection(async (conn) => {
					const rows = await conn.query<DbRow>(
						"SELECT * FROM applications WHERE id = ?",
						[id],
					);
					return rows.length > 0 ? rowToApplication(rows[0]!) : null;
				});
			} catch (err) {
				if (isNoSuchTable(err)) return null;
				throw err;
			}
		},

		async listByMonth(monthCycle: string): Promise<ApplicationRow[]> {
			try {
				return await pool.withConnection(async (conn) => {
					const rows = await conn.query<DbRow>(
						"SELECT * FROM applications WHERE month_cycle = ? ORDER BY applied_at DESC",
						[monthCycle],
					);
					return rows.map(rowToApplication);
				});
			} catch (err) {
				if (isNoSuchTable(err)) return [];
				throw err;
			}
		},

		async listDistinctMonths(): Promise<string[]> {
			try {
				return await pool.withConnection(async (conn) => {
					const rows = await conn.query<{ month_cycle: string }>(
						"SELECT DISTINCT month_cycle FROM applications ORDER BY month_cycle DESC",
					);
					return rows.map((r) => r.month_cycle);
				});
			} catch (err) {
				if (isNoSuchTable(err)) return [];
				throw err;
			}
		},
	};
}
