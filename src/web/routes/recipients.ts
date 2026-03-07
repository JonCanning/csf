import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import {
	createRecipient,
	deleteRecipient,
	updateRecipient,
} from "../../domain/recipient/commandHandlers.ts";
import type { RecipientRepository } from "../../domain/recipient/repository.ts";
import type { Recipient } from "../../domain/recipient/types.ts";
import { createPanel, editPanel, viewPanel } from "../pages/recipientPanel.ts";
import { recipientRow, recipientsPage } from "../pages/recipients.ts";
import { patchElements, sseResponse } from "../sse.ts";

export function createRecipientRoutes(
	recipientRepo: RecipientRepository,
	eventStore: SQLiteEventStore,
) {
	return {
		async list(): Promise<Response> {
			const recipients = await recipientRepo.list();
			return new Response(recipientsPage(recipients), {
				headers: { "Content-Type": "text/html" },
			});
		},

		async detail(id: string): Promise<Response> {
			const recipient = await recipientRepo.getById(id);
			if (!recipient) return new Response("Not found", { status: 404 });
			return sseResponse(patchElements(viewPanel(recipient)));
		},

		async edit(id: string): Promise<Response> {
			const recipient = await recipientRepo.getById(id);
			if (!recipient) return new Response("Not found", { status: 404 });
			return sseResponse(patchElements(editPanel(recipient)));
		},

		create(): Response {
			return sseResponse(patchElements(createPanel()));
		},

		async handleCreate(form: FormData, volunteerId: string): Promise<Response> {
			let data: ReturnType<typeof formToRecipientData>;
			try {
				data = formToRecipientData(form);
			} catch {
				return new Response("Name and phone are required", { status: 400 });
			}
			const { id } = await createRecipient(
				{ ...data, volunteerId },
				eventStore,
			);
			const recipients = await recipientRepo.list();
			const recipient = await recipientRepo.getById(id);
			if (!recipient) return new Response("Not found", { status: 404 });
			return sseResponse(
				patchElements(recipientsTableBody(recipients)),
				patchElements(viewPanel(recipient)),
			);
		},

		async handleUpdate(
			id: string,
			form: FormData,
			volunteerId: string,
		): Promise<Response> {
			let data: ReturnType<typeof formToRecipientData>;
			try {
				data = formToRecipientData(form);
			} catch {
				return new Response("Name and phone are required", { status: 400 });
			}
			await updateRecipient(id, volunteerId, data, eventStore);
			const recipient = await recipientRepo.getById(id);
			if (!recipient) return new Response("Not found", { status: 404 });
			const recipients = await recipientRepo.list();
			return sseResponse(
				patchElements(viewPanel(recipient)),
				patchElements(recipientsTableBody(recipients)),
			);
		},

		async handleDelete(id: string, volunteerId: string): Promise<Response> {
			await deleteRecipient(id, volunteerId, eventStore);
			const recipients = await recipientRepo.list();
			return sseResponse(
				patchElements('<div id="panel"></div>'),
				patchElements(recipientsTableBody(recipients)),
			);
		},
	};
}

function getString(form: FormData, key: string): string | undefined {
	const val = form.get(key);
	return typeof val === "string" && val.length > 0 ? val : undefined;
}

function formToRecipientData(form: FormData) {
	const name = getString(form, "name");
	const phone = getString(form, "phone");
	if (!name || !phone) {
		throw new Error("Name and phone are required");
	}
	const rawPref = getString(form, "paymentPreference");
	const pref = rawPref === "bank" ? "bank" : "cash";
	const sortCode = getString(form, "sortCode");
	const accountNumber = getString(form, "accountNumber");
	return {
		name,
		phone,
		email: getString(form, "email"),
		paymentPreference: pref,
		meetingPlace: getString(form, "meetingPlace"),
		bankDetails:
			pref === "bank" && sortCode && accountNumber
				? { sortCode, accountNumber }
				: undefined,
		notes: getString(form, "notes"),
	};
}

function recipientsTableBody(recipients: Recipient[]): string {
	if (recipients.length === 0) {
		return '<tbody id="recipient-rows"><tr><td colspan="4" class="text-center py-12 text-bark-muted">No recipients yet</td></tr></tbody>';
	}
	return `<tbody id="recipient-rows">${recipients.map(recipientRow).join("")}</tbody>`;
}
