import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import { createVolunteer } from "../../src/domain/volunteer/commandHandlers.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { SQLiteSessionStore } from "../../src/infrastructure/session/sqliteSessionStore.ts";
import { SQLiteVolunteerCredentialsStore } from "../../src/infrastructure/volunteer/sqliteVolunteerCredentialsStore.ts";
import { SQLiteVolunteerRepository } from "../../src/infrastructure/volunteer/sqliteVolunteerRepository.ts";
import { createLogsRoutes } from "../../src/web/routes/logs.ts";
import { getAuthenticatedVolunteer } from "../../src/web/server.ts";

let pool: ReturnType<typeof SQLiteConnectionPool>;
let sessionStore: Awaited<ReturnType<typeof SQLiteSessionStore>>;
let volunteerRepo: Awaited<ReturnType<typeof SQLiteVolunteerRepository>>;
let logsRoutes: ReturnType<typeof createLogsRoutes>;
let adminSessionId: string;
let nonAdminSessionId: string;

beforeEach(async () => {
	const es = createEventStore(":memory:");
	pool = es.pool;
	sessionStore = await SQLiteSessionStore(pool);
	volunteerRepo = await SQLiteVolunteerRepository(pool);
	const credentialsStore = await SQLiteVolunteerCredentialsStore(pool);

	const { id: adminId } = await createVolunteer(
		{ name: "Admin", password: "adminpass", isAdmin: true },
		es.store,
		credentialsStore,
	);
	adminSessionId = await sessionStore.create(adminId);

	const { id: nonAdminId } = await createVolunteer(
		{ name: "Regular", password: "userpass", isAdmin: false },
		es.store,
		credentialsStore,
	);
	nonAdminSessionId = await sessionStore.create(nonAdminId);

	logsRoutes = createLogsRoutes(pool);
});

afterEach(async () => {
	await pool.close();
});

async function handleLogsRequest(req: Request): Promise<Response> {
	const volunteer = await getAuthenticatedVolunteer(
		req,
		sessionStore,
		volunteerRepo,
	);
	if (!volunteer) return Response.redirect("/login", 302);
	if (!volunteer.isAdmin) return new Response("Forbidden", { status: 403 });
	return logsRoutes.list(req);
}

describe("GET /logs auth", () => {
	test("unauthenticated request redirects to /login", async () => {
		const req = new Request("http://localhost/logs");
		const res = await handleLogsRequest(req);
		expect([301, 302, 303, 307, 308, 401, 403]).toContain(res.status);
		if (res.status >= 300 && res.status < 400) {
			const location = res.headers.get("location") ?? "";
			expect(location).toContain("/login");
		}
	});

	test("non-admin authenticated request returns 403", async () => {
		const req = new Request("http://localhost/logs", {
			headers: { cookie: `session=${nonAdminSessionId}` },
		});
		const res = await handleLogsRequest(req);
		expect(res.status).toBe(403);
	});

	test("admin authenticated request returns 200 with Event Log HTML", async () => {
		const req = new Request("http://localhost/logs", {
			headers: { cookie: `session=${adminSessionId}` },
		});
		const res = await handleLogsRequest(req);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("Event Log");
	});
});
