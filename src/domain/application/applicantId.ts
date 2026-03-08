import { normalizeName } from "./normalizeName.ts";

export function toApplicantId(phone: string, name?: string): string {
	if (name === undefined) {
		return `applicant-${phone}`;
	}
	return `applicant-${phone}-${normalizeName(name)}`;
}
