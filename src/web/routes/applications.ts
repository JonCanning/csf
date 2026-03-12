import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import type { ApplicantRepository } from "../../domain/applicant/repository.ts";
import { toApplicantId } from "../../domain/application/applicantId.ts";
import { checkEligibility } from "../../domain/application/checkEligibility.ts";
import type {
	ApplicationFilters,
	ApplicationRepository,
} from "../../domain/application/repository.ts";
import { reviewApplication } from "../../domain/application/reviewApplication.ts";
import { reviewPanel, viewPanel } from "../pages/applicationPanel.ts";
import {
	applicationsPage,
	applicationsTableBody,
} from "../pages/applications.ts";
import { patchElements, sseResponse } from "../sse.ts";
import { currentMonthCycle } from "./utils.ts";

export function createApplicationRoutes(
	appRepo: ApplicationRepository,
	applicantRepo: ApplicantRepository,
	eventStore: SQLiteEventStore,
	pool: ReturnType<typeof SQLiteConnectionPool>,
) {
	return {
		async list(
			month?: string,
			filters?: ApplicationFilters,
		): Promise<Response> {
			const months = await appRepo.listDistinctMonths();
			const currentMonth = month ?? months[0] ?? currentMonthCycle();
			const applications = await appRepo.listByMonth(currentMonth, filters);
			return new Response(
				applicationsPage(applications, months, currentMonth, filters),
				{
					headers: { "Content-Type": "text/html" },
				},
			);
		},

		async detail(id: string): Promise<Response> {
			const app = await appRepo.getById(id);
			if (!app) return new Response("Not found", { status: 404 });
			const applicant =
				app.phone && app.name
					? await applicantRepo.getByPhoneAndName(app.phone, app.name)
					: null;
			const panel =
				app.status === "flagged"
					? reviewPanel(app, applicant?.id ?? null)
					: viewPanel(app, applicant?.id ?? null);
			return sseResponse(patchElements(panel));
		},

		async handleReview(
			applicationId: string,
			decision: "confirm" | "reject",
			volunteerId: string,
		): Promise<Response> {
			const app = await appRepo.getById(applicationId);
			if (!app) return new Response("Not found", { status: 404 });

			// When confirming, check eligibility against the submitted identity (phone+name),
			// not the conflicting existing applicant. This allows confirmation even when the
			// existing applicant already has an accepted application this month.
			const confirmedApplicantId =
				decision === "confirm" && app.phone && app.name
					? toApplicantId(app.phone, app.name)
					: undefined;

			const eligibility =
				decision === "confirm"
					? await checkEligibility(
							confirmedApplicantId ?? app.applicantId,
							app.monthCycle,
							pool,
							{ skipWindowCheck: true },
						)
					: ({ status: "eligible" } as const);

			await reviewApplication(
				applicationId,
				volunteerId,
				decision,
				eligibility,
				eventStore,
				confirmedApplicantId,
			);

			const updated = await appRepo.getById(applicationId);
			if (!updated) return new Response("Not found", { status: 404 });

			const applications = await appRepo.listByMonth(app.monthCycle);
			return sseResponse(
				patchElements(viewPanel(updated)),
				patchElements(applicationsTableBody(applications)),
			);
		},

		closePanel(): Response {
			return sseResponse(patchElements('<div id="panel"></div>'));
		},
	};
}
