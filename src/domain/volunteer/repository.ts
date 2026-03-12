import type { Volunteer } from "./types.ts";

export interface VolunteerRepository {
	getById(id: string): Promise<Volunteer | null>;
	getByName(name: string): Promise<Volunteer | null>;
	list(): Promise<Volunteer[]>;
	getAdmins(): Promise<Volunteer[]>;
	verifyPassword(id: string, password: string): Promise<boolean>;
}

export interface VolunteerCredentialsStore {
	setPassword(volunteerId: string, hash: string): Promise<void>;
}
