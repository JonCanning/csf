import type { SQLiteConnection } from "@event-driven-io/emmett-sqlite";
import { normalizeName } from "./normalizeName.ts";
import type { IdentityResolution } from "./types.ts";

export async function resolveIdentity(
	phone: string,
	name: string,
	connection: SQLiteConnection,
): Promise<IdentityResolution> {
	let rows: { applicant_id: string; name: string }[];
	try {
		rows = await connection.query<{
			applicant_id: string;
			name: string;
		}>("SELECT applicant_id, name FROM known_applicants WHERE phone = ?", [
			phone,
		]);
	} catch {
		return { type: "new" };
	}

	if (rows.length === 0) {
		return { type: "new" };
	}

	const existing = rows[0];
	if (!existing) {
		return { type: "new" };
	}

	if (normalizeName(name) === normalizeName(existing.name)) {
		return { type: "matched", applicantId: existing.applicant_id };
	}

	return {
		type: "flagged",
		applicantId: existing.applicant_id,
		reason: "Phone matches but name differs",
	};
}
