import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import type { RecipientRepository } from "../../domain/recipient/repository.ts";
import type {
	PaymentPreference,
	Recipient,
} from "../../domain/recipient/types.ts";

type RecipientRow = {
	id: string;
	phone: string;
	name: string;
	email: string | null;
	payment_preference: string;
	meeting_place: string | null;
	bank_sort_code: string | null;
	bank_account_number: string | null;
	notes: string | null;
	created_at: string;
	updated_at: string;
};

function isPaymentPreference(v: string): v is PaymentPreference {
	return v === "bank" || v === "cash";
}

function rowToRecipient(row: RecipientRow): Recipient {
	if (!isPaymentPreference(row.payment_preference)) {
		throw new Error(
			`Invalid payment_preference in DB: ${row.payment_preference}`,
		);
	}
	return {
		id: row.id,
		phone: row.phone,
		name: row.name,
		email: row.email ?? undefined,
		paymentPreference: row.payment_preference,
		meetingPlace: row.meeting_place ?? undefined,
		bankDetails:
			row.bank_sort_code && row.bank_account_number
				? {
						sortCode: row.bank_sort_code,
						accountNumber: row.bank_account_number,
					}
				: undefined,
		notes: row.notes ?? undefined,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export async function SQLiteRecipientRepository(
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<RecipientRepository> {
	await pool.withConnection(async (conn) => {
		await conn.command(`
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
	});

	return {
		async getById(id: string): Promise<Recipient | null> {
			return await pool.withConnection(async (conn) => {
				const rows = await conn.query<RecipientRow>(
					"SELECT * FROM recipients WHERE id = ?",
					[id],
				);
				return rows.length > 0 ? rowToRecipient(rows[0]!) : null;
			});
		},

		async getByPhone(phone: string): Promise<Recipient | null> {
			return await pool.withConnection(async (conn) => {
				const rows = await conn.query<RecipientRow>(
					"SELECT * FROM recipients WHERE phone = ?",
					[phone],
				);
				return rows.length > 0 ? rowToRecipient(rows[0]!) : null;
			});
		},

		async list(): Promise<Recipient[]> {
			return await pool.withConnection(async (conn) => {
				const rows = await conn.query<RecipientRow>(
					"SELECT * FROM recipients ORDER BY created_at DESC",
				);
				return rows.map(rowToRecipient);
			});
		},
	};
}
