import type {
	ApplicationRepository,
	ApplicationRow,
} from "../../domain/application/repository.ts";
import type { GrantRepository } from "../../domain/grant/repository.ts";
import { statusLookupPage, statusTimelinePage } from "../pages/status.ts";

const NOT_FOUND_MSG =
	"We couldn't find an application with that reference number. Please check and try again.";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

interface RateLimitEntry {
	count: number;
	windowStart: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

function isRateLimited(key: string): boolean {
	const now = Date.now();
	const entry = rateLimitMap.get(key);
	if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
		rateLimitMap.set(key, { count: 1, windowStart: now });
		return false;
	}
	entry.count += 1;
	return entry.count > RATE_LIMIT_MAX;
}

export function createStatusRoutes(
	appRepo: ApplicationRepository,
	grantRepo: GrantRepository,
) {
	return {
		async show(req: Request): Promise<Response> {
			const ip =
				req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
			if (isRateLimited(ip)) {
				return new Response("Too many requests", { status: 429 });
			}

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
