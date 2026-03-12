import { describe, expect, it } from "bun:test";
import { seededShuffle } from "./seededShuffle.ts";

const ITEMS = ["a", "b", "c", "d", "e", "f", "g", "h"];

describe("seededShuffle", () => {
	it("returns same order for same seed (determinism)", () => {
		const seed = "stable-seed-123";
		const first = seededShuffle(ITEMS, seed);
		const second = seededShuffle(ITEMS, seed);

		expect(first).toEqual(second);
	});

	it("produces different orders for different seeds", () => {
		const r1 = seededShuffle(ITEMS, "seed-alpha");
		const r2 = seededShuffle(ITEMS, "seed-beta");

		// With 8 elements the chance of identical shuffles is ~1/40320; safe to assert inequality
		expect(r1).not.toEqual(r2);
	});

	it("preserves all elements (no loss or duplication)", () => {
		const result = seededShuffle(ITEMS, "any-seed");

		expect(result).toHaveLength(ITEMS.length);
		expect([...result].sort()).toEqual([...ITEMS].sort());
	});

	it("handles empty array", () => {
		expect(seededShuffle([], "any-seed")).toEqual([]);
	});

	it("handles single-element array", () => {
		expect(seededShuffle(["only"], "any-seed")).toEqual(["only"]);
	});

	it("does not mutate the input array", () => {
		const input = ["x", "y", "z"];
		const copy = [...input];
		seededShuffle(input, "seed");

		expect(input).toEqual(copy);
	});

	it("distributes positions across multiple seeds (smoke test)", () => {
		// Run 20 shuffles with different seeds; at least one should differ from identity order
		const identity = [...ITEMS];
		const results = Array.from({ length: 20 }, (_, i) =>
			seededShuffle(ITEMS, `seed-${i}`),
		);
		const anyDiffersFromIdentity = results.some(
			(r) => !r.every((v, i) => v === identity[i]),
		);

		expect(anyDiffersFromIdentity).toBe(true);
	});

	it("works with numeric arrays", () => {
		const nums = [1, 2, 3, 4, 5];
		const result = seededShuffle(nums, "num-seed");

		expect(result).toHaveLength(5);
		expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
	});
});
