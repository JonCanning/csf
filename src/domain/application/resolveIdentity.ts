import type { RecipientRepository } from "../recipient/repository.ts";
import { toApplicantId } from "./applicantId.ts";
import { normalizeName } from "./normalizeName.ts";
import type { IdentityResolution } from "./types.ts";

export async function resolveIdentity(
	phone: string,
	name: string,
	recipientRepo: RecipientRepository,
): Promise<IdentityResolution> {
	const existing = await recipientRepo.getByPhone(phone);

	if (!existing) {
		return { type: "new" };
	}

	const applicantId = toApplicantId(phone);

	if (normalizeName(name) === normalizeName(existing.name)) {
		return { type: "matched", applicantId };
	}

	return {
		type: "flagged",
		applicantId,
		reason: "Phone matches but name differs",
	};
}
