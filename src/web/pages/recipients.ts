import type { Recipient } from "../../domain/recipient/types.ts";
import { layout } from "./layout.ts";

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function escapeJsString(s: string): string {
	return s
		.replace(/\\/g, "\\\\")
		.replace(/'/g, "\\'")
		.replace(/`/g, "\\`")
		.replace(/\$/g, "\\$");
}

function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function paymentBadge(pref: "bank" | "cash"): string {
	if (pref === "bank") {
		return `<span class="badge bg-blue-50 text-blue-700 border-blue-200">Bank</span>`;
	}
	return `<span class="badge bg-green-50 text-green-700 border-green-200">Cash</span>`;
}

export function recipientRow(r: Recipient): string {
	const nameLower = escapeJsString(r.name.toLowerCase());
	const phone = escapeJsString(r.phone);
	const showExpr = `$search === '' || '${nameLower}'.includes($search.toLowerCase()) || '${phone}'.includes($search)`;
	return `<tr
		class="table-row"
		data-on-click="@get('/recipients/${encodeURIComponent(r.id)}/edit')"
		data-show="${escapeHtml(showExpr)}">
		<td class="px-4 py-3 font-medium text-bark">${escapeHtml(r.name)}</td>
		<td class="px-4 py-3 text-bark-muted">${escapeHtml(r.phone)}</td>
		<td class="px-4 py-3">${paymentBadge(r.paymentPreference)}</td>
		<td class="px-4 py-3 text-bark-muted text-sm">${formatDate(r.createdAt)}</td>
	</tr>`;
}

export function recipientsPage(recipients: Recipient[]): string {
	const emptyRow = `<tr><td colspan="4" class="text-center py-12 text-bark-muted">No recipients yet</td></tr>`;
	const rows =
		recipients.length === 0
			? emptyRow
			: recipients.map(recipientRow).join("\n");

	const tableOrEmpty = `<div class="overflow-x-auto">
				<table class="w-full text-left border-collapse">
					<thead>
						<tr class="border-b-2 border-cream-300 bg-cream-100">
							<th class="th">Name</th>
							<th class="th">Phone</th>
							<th class="th">Payment</th>
							<th class="th">Added</th>
						</tr>
					</thead>
					<tbody id="recipient-rows">
						${rows}
					</tbody>
				</table>
			</div>`;

	const body = `<div class="max-w-5xl mx-auto px-4 py-8" data-signals='{"search": ""}'>
	<div class="flex items-center justify-between mb-6">
		<div class="flex items-center gap-3">
			<a href="/" class="text-bark-muted hover:text-bark transition-colors text-sm">&larr; Back</a>
			<h1 class="font-heading text-2xl font-semibold text-bark">Recipients</h1>
		</div>
		<button
			class="btn btn-primary"
			data-on-click="@get('/recipients/new')">
			Add Recipient
		</button>
	</div>

	<div class="mb-4">
		<input
			type="text"
			placeholder="Search by name or phone&hellip;"
			data-bind-search
			class="input max-w-sm bg-white text-sm placeholder-bark-muted" />
	</div>

	<div class="card">
		${tableOrEmpty}
	</div>

	<div id="panel"></div>
</div>`;

	return layout("Recipients", body);
}
