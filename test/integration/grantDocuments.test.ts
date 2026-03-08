import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { GrantDocumentStore } from "../../src/infrastructure/projections/grantDocuments.ts";

describe("GrantDocumentStore", () => {
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let docStore: ReturnType<typeof GrantDocumentStore>;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		pool = es.pool;
		docStore = GrantDocumentStore(pool);
		await docStore.init();
	});

	afterEach(async () => {
		await pool.close();
	});

	test("store and retrieve a document by id", async () => {
		const data = Buffer.from("test-image-data");
		await docStore.store({
			id: "doc-1",
			grantId: "g1",
			type: "proof_of_address",
			data,
			mimeType: "image/png",
		});

		const doc = await docStore.getById("doc-1");
		expect(doc).not.toBeNull();
		expect(doc?.grantId).toBe("g1");
		expect(doc?.type).toBe("proof_of_address");
		expect(doc?.mimeType).toBe("image/png");
		expect(Buffer.from(doc?.data ?? []).toString()).toBe("test-image-data");
	});

	test("getById returns null for unknown document", async () => {
		const doc = await docStore.getById("nonexistent");
		expect(doc).toBeNull();
	});

	test("getByGrantId returns all documents for a grant", async () => {
		const data = Buffer.from("test");
		await docStore.store({
			id: "doc-1",
			grantId: "g1",
			type: "proof_of_address",
			data,
			mimeType: "image/png",
		});
		await docStore.store({
			id: "doc-2",
			grantId: "g1",
			type: "proof_of_address",
			data,
			mimeType: "image/jpeg",
		});
		await docStore.store({
			id: "doc-3",
			grantId: "g2",
			type: "proof_of_address",
			data,
			mimeType: "image/png",
		});

		const docs = await docStore.getByGrantId("g1");
		expect(docs).toHaveLength(2);
	});

	test("getByGrantId returns empty array for unknown grant", async () => {
		const docs = await docStore.getByGrantId("nonexistent");
		expect(docs).toEqual([]);
	});
});
