import { describe, expect, it } from "bun:test";
import { normalizeName } from "./normalizeName.ts";

describe("normalizeName", () => {
	it("lowercases input", () => {
		expect(normalizeName("JANE DOE")).toBe("jane doe");
	});

	it("trims leading and trailing whitespace", () => {
		expect(normalizeName("  Jane Doe  ")).toBe("jane doe");
	});

	it("collapses internal whitespace", () => {
		expect(normalizeName("Jane   Doe")).toBe("jane doe");
	});

	it("strips diacritics", () => {
		expect(normalizeName("José")).toBe("jose");
		expect(normalizeName("Ångström")).toBe("angstrom");
		expect(normalizeName("Müller")).toBe("muller");
	});

	it("handles combined whitespace and diacritics", () => {
		expect(normalizeName("  María  José  ")).toBe("maria jose");
	});

	it("returns empty string for empty input", () => {
		expect(normalizeName("")).toBe("");
	});

	it("returns empty string for whitespace-only input", () => {
		expect(normalizeName("   ")).toBe("");
	});

	it("preserves single-word names", () => {
		expect(normalizeName("Alice")).toBe("alice");
	});

	it("is idempotent", () => {
		const once = normalizeName("  Óscar Pérez  ");
		const twice = normalizeName(once);
		expect(once).toBe(twice);
	});
});
