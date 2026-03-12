import type {
	ApplicationRepository,
	ApplicationRow,
} from "../../domain/application/repository.ts";
import type { GrantRepository } from "../../domain/grant/repository.ts";
import { statusLookupPage, statusTimelinePage } from "../pages/status.ts";

const NOT_FOUND_MSG =
	"We couldn't find an application with that reference number. Please check and try again.";

export function createStatusRoutes(
	appRepo: ApplicationRepository,
	grantRepo: GrantRepository,
) {
	return {
		async show(req: Request): Promise<Response> {
			const url = new URL(req.url);
			const ref = url.searchParams.get("ref")?.trim() ?? "";

			// No ref — show blank lookup form
			if (!ref) {
				return html(statusLookupPage());
			}

			// Malformed ref — skip DB query
			const refNum = parseInt(ref, 10);
			if (!Number.isInteger(refNum) || refNum <= 0 || String(refNum) !== ref) {
				return html(statusLookupPage(NOT_FOUND_MSG));
			}

			// Lookup application
			let app: ApplicationRow | null;
			try {
				app = await appRepo.getByRef(refNum);
			} catch {
				return html(statusLookupPage(NOT_FOUND_MSG));
			}

			if (!app || app.status === "initial") {
				return html(statusLookupPage(NOT_FOUND_MSG));
			}

			// Lookup grant if selected
			let grant = null;
			if (app.status === "selected") {
				try {
					grant = await grantRepo.getByApplicationId(app.id);
				} catch {
					// Non-fatal: render without grant (shows "volunteer being assigned")
				}
			}

			return html(statusTimelinePage(app, grant));
		},
	};
}

function html(body: string): Response {
	return new Response(body, { headers: { "Content-Type": "text/html" } });
}
