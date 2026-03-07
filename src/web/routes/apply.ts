import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { toApplicantId } from "../../domain/application/applicantId.ts";
import { checkEligibility } from "../../domain/application/checkEligibility.ts";
import { submitApplication } from "../../domain/application/submitApplication.ts";
import type { PaymentPreference } from "../../domain/application/types.ts";
import type { RecipientRepository } from "../../domain/recipient/repository.ts";
import { applyClosedPage, applyPage, applyResultPage } from "../pages/apply.ts";

function currentMonthCycle(): string {
	const now = new Date();
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, "0");
	return `${y}-${m}`;
}

async function isWindowOpen(
	monthCycle: string,
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<boolean> {
	return pool.withConnection(async (conn) => {
		const tables = await conn.query<{ name: string }>(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='lottery_windows'",
		);
		if (tables.length === 0) return false;
		const rows = await conn.query<{ status: string }>(
			"SELECT status FROM lottery_windows WHERE month_cycle = ? LIMIT 1",
			[monthCycle],
		);
		return rows.length > 0 && rows[0]?.status === "open";
	});
}

export function createApplyRoutes(
	eventStore: SQLiteEventStore,
	pool: ReturnType<typeof SQLiteConnectionPool>,
	recipientRepo: RecipientRepository,
) {
	return {
		async showForm(): Promise<Response> {
			const monthCycle = currentMonthCycle();
			const open = await isWindowOpen(monthCycle, pool);
			const html = open ? applyPage() : applyClosedPage();
			return new Response(html, {
				headers: { "Content-Type": "text/html" },
			});
		},

		async handleSubmit(req: Request): Promise<Response> {
			const formData = await req.formData();
			const name = String(formData.get("name") ?? "").trim();
			const phone = String(formData.get("phone") ?? "").trim();
			const email = String(formData.get("email") ?? "").trim() || undefined;
			const meetingPlace = String(formData.get("meetingPlace") ?? "").trim();
			const paymentPref = String(formData.get("paymentPreference") ?? "cash");

			if (!name || !phone || !meetingPlace) {
				return new Response("Name, phone, and meeting place are required", {
					status: 400,
				});
			}

			const paymentPreference: PaymentPreference =
				paymentPref === "bank" ? "bank" : "cash";
			const monthCycle = currentMonthCycle();
			const applicantId = toApplicantId(phone);
			const eligibility = await checkEligibility(applicantId, monthCycle, pool);

			const applicationId = crypto.randomUUID();
			const { events } = await submitApplication(
				{
					applicationId,
					phone,
					name,
					email,
					paymentPreference,
					meetingPlace,
					monthCycle,
					eligibility,
				},
				eventStore,
				recipientRepo,
			);

			const lastEvent = events[events.length - 1];
			let status = "accepted";
			let reason = "";

			if (lastEvent?.type === "ApplicationRejected") {
				status = "rejected";
				reason = lastEvent.data.reason;
			} else if (lastEvent?.type === "ApplicationFlaggedForReview") {
				status = "flagged";
			}

			const params = new URLSearchParams({ status });
			if (reason) params.set("reason", reason);

			return Response.redirect(`/apply/result?${params}`, 302);
		},

		showResult(req: Request): Response {
			const url = new URL(req.url);
			const status = url.searchParams.get("status") ?? "accepted";
			const reason = url.searchParams.get("reason") ?? undefined;
			return new Response(applyResultPage(status, reason), {
				headers: { "Content-Type": "text/html" },
			});
		},
	};
}
