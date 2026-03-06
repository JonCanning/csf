import { inlineProjections } from "@event-driven-io/emmett";
import {
	getSQLiteEventStore,
	SQLiteConnectionPool,
	type SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { eligibilityProjection } from "./projections/eligibility.ts";
import { recipientProjection } from "./projections/recipient.ts";
import { volunteerProjection } from "./projections/volunteer.ts";

export type EventStoreWithPool = {
	store: SQLiteEventStore;
	pool: ReturnType<typeof SQLiteConnectionPool>;
};

export function createEventStore(fileName: string): EventStoreWithPool {
	const pool = SQLiteConnectionPool({ fileName });
	const store = getSQLiteEventStore({
		fileName: undefined,
		pool,
		schema: { autoMigration: "CreateOrUpdate" },
		projections: inlineProjections([
			eligibilityProjection,
			recipientProjection,
			volunteerProjection,
		]),
	});
	return { store, pool };
}
