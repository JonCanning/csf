import { setFundName } from "../config.ts";
import { SQLiteApplicantRepository } from "../infrastructure/applicant/sqliteApplicantRepository.ts";
import { createEventStore } from "../infrastructure/eventStore.ts";
import { SQLiteSessionStore } from "../infrastructure/session/sqliteSessionStore.ts";
import { SQLiteVolunteerRepository } from "../infrastructure/volunteer/sqliteVolunteerRepository.ts";
import { startServer } from "./server.ts";

const dbPath = process.env.DB_PATH ?? "csf.db";
const fundName = process.env.FUND_NAME ?? "Community Solidarity Fund";
setFundName(fundName);

const { store: eventStore, pool } = createEventStore(dbPath);
const sessionStore = await SQLiteSessionStore(pool);
const volunteerRepo = await SQLiteVolunteerRepository(pool);
const applicantRepo = await SQLiteApplicantRepository(pool);

const server = await startServer(
	sessionStore,
	volunteerRepo,
	applicantRepo,
	eventStore,
	pool,
);

console.log(`${fundName} server running at http://localhost:${server.port}`);
