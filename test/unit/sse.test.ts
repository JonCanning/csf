import { describe, expect, test } from "bun:test";
import { patchElements, patchSignals, sseResponse } from "../../src/web/sse";

describe("SSE helpers", () => {
	test("patchElements returns an action function", () => {
		const action = patchElements('<div id="panel">Hello</div>');
		expect(typeof action).toBe("function");
	});

	test("patchSignals returns an action function", () => {
		const action = patchSignals({ search: "", panelOpen: false });
		expect(typeof action).toBe("function");
	});

	test("sseResponse creates Response with correct headers", async () => {
		const res = sseResponse(patchElements('<div id="panel">Hello</div>'));
		expect(res.headers.get("Content-Type")).toBe("text/event-stream");
		expect(res.headers.get("Cache-Control")).toBe("no-cache");
	});

	test("sseResponse body contains SSE event data", async () => {
		const res = sseResponse(patchElements('<div id="panel">Hello</div>'));
		const body = await res.text();
		expect(body).toContain("datastar-patch-elements");
		expect(body).toContain("Hello");
	});

	test("sseResponse handles multiple actions", async () => {
		const res = sseResponse(
			patchElements('<div id="a">First</div>'),
			patchSignals({ foo: "bar" }),
		);
		const body = await res.text();
		expect(body).toContain("datastar-patch-elements");
		expect(body).toContain("datastar-patch-signals");
		expect(body).toContain("First");
		expect(body).toContain("bar");
	});

	test("patchElements with mode and selector", async () => {
		const res = sseResponse(
			patchElements("<p>Hi</p>", { selector: "#target", mode: "inner" }),
		);
		const body = await res.text();
		expect(body).toContain("selector #target");
		expect(body).toContain("mode inner");
	});
});
