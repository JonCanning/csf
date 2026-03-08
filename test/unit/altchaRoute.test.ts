import { describe, expect, test } from "bun:test";
import { createAltchaRoutes } from "../../src/web/routes/altcha.ts";

describe("altcha challenge route", () => {
	const routes = createAltchaRoutes("test-hmac-key");

	test("returns a challenge JSON with required fields", async () => {
		const res = await routes.challenge();
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("application/json");
		const body = await res.json();
		expect(body).toHaveProperty("algorithm");
		expect(body).toHaveProperty("challenge");
		expect(body).toHaveProperty("salt");
		expect(body).toHaveProperty("maxnumber");
	});
});
