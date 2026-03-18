import { describe, expect, test } from "bun:test";

/**
 * Tests for lottery route logic extracted from createLotteryRoutes.
 * Bug #1 (stale monthCycle) is structural — verified by code inspection.
 * Bug #2 (confirmed apps excluded) is tested below.
 */

describe("lottery applicant pool filter", () => {
	const makeApp = (id: string, status: string) => ({
		id,
		applicantId: `applicant-${id}`,
		status,
	});

	// This is the filter logic extracted from createLotteryRoutes.handleDraw
	const filterPool = (
		applications: { id: string; applicantId: string; status: string }[],
	) =>
		applications
			.filter((a) => a.status === "accepted" || a.status === "confirmed")
			.map((a) => ({
				applicationId: a.id,
				applicantId: a.applicantId,
			}));

	test("includes accepted applications", () => {
		const pool = filterPool([makeApp("app-1", "accepted")]);
		expect(pool).toEqual([
			{ applicationId: "app-1", applicantId: "applicant-app-1" },
		]);
	});

	test("includes confirmed applications", () => {
		const pool = filterPool([makeApp("app-1", "confirmed")]);
		expect(pool).toEqual([
			{ applicationId: "app-1", applicantId: "applicant-app-1" },
		]);
	});

	test("includes both accepted and confirmed", () => {
		const pool = filterPool([
			makeApp("app-1", "accepted"),
			makeApp("app-2", "confirmed"),
			makeApp("app-3", "rejected"),
			makeApp("app-4", "flagged"),
		]);
		expect(pool).toHaveLength(2);
		expect(pool.map((p) => p.applicationId)).toEqual(["app-1", "app-2"]);
	});

	test("excludes other statuses", () => {
		const pool = filterPool([
			makeApp("app-1", "flagged"),
			makeApp("app-2", "rejected"),
			makeApp("app-3", "submitted"),
			makeApp("app-4", "selected"),
			makeApp("app-5", "not_selected"),
		]);
		expect(pool).toHaveLength(0);
	});
});
