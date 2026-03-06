import type { Recipient } from "./types.ts";

export interface RecipientRepository {
	getById(id: string): Promise<Recipient | null>;
	getByPhone(phone: string): Promise<Recipient | null>;
	list(): Promise<Recipient[]>;
}
