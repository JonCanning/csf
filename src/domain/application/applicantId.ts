import { normalizeName } from "./normalizeName.ts";

export function toApplicantId(phone: string, name: string): string {
	return `applicant-${phone}-${normalizeName(name)}`;
}
