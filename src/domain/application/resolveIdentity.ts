import type { ApplicantRepository } from "../applicant/repository.ts";
import type { IdentityResolution } from "./types.ts";

export async function resolveIdentity(
	phone: string,
	name: string,
	applicantRepo: ApplicantRepository,
): Promise<IdentityResolution> {
	const exactMatch = await applicantRepo.getByPhoneAndName(phone, name);

	if (exactMatch) {
		return { type: "matched", applicantId: exactMatch.id };
	}

	const phoneMatches = await applicantRepo.getByPhone(phone);

	if (phoneMatches.length === 0) {
		return { type: "new" };
	}

	return {
		type: "flagged",
		applicantId: phoneMatches[0].id,
		reason: "Phone matches but name differs",
	};
}
