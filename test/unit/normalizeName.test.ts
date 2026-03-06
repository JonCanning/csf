import { expect, test } from "bun:test";
import { normalizeName } from "../../src/domain/application/normalizeName.ts";

test("lowercases name", () => {
	expect(normalizeName("Alice")).toBe("alice");
});

test("trims whitespace", () => {
	expect(normalizeName("  Alice  ")).toBe("alice");
});

test("collapses internal whitespace", () => {
	expect(normalizeName("Mary  Jane")).toBe("mary jane");
});

test("strips diacritics", () => {
	expect(normalizeName("José")).toBe("jose");
	expect(normalizeName("Müller")).toBe("muller");
	expect(normalizeName("Françoise")).toBe("francoise");
});

test("handles combined normalization", () => {
	expect(normalizeName("  José  María  ")).toBe("jose maria");
});
