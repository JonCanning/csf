import type { Recipient } from "../../domain/recipient/types";
import { layout } from "./layout";

function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function paymentBadge(pref: "bank" | "cash"): string {
	if (pref === "bank") {
		return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200">Bank</span>`;
	}
	return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-green-50 text-green-700 border-green-200">Cash</span>`;
}

export function recipientRow(r: Recipient): string {
	const nameLower = r.name.toLowerCase();
	const showExpr = `$search === '' || '${nameLower}'.includes($search.toLowerCase()) || '${r.phone}'.includes($search)`;
	return `<tr
		class="border-b border-cream-200 hover:bg-cream-50 cursor-pointer transition-colors"
		data-on-click="@get('/recipients/${r.id}')"
		data-show="${showExpr.replace(/"/g, "&quot;")}">
		<td class="px-4 py-3 font-medium text-bark">${r.name}</td>
		<td class="px-4 py-3 text-bark-muted">${r.phone}</td>
		<td class="px-4 py-3">${paymentBadge(r.paymentPreference)}</td>
		<td class="px-4 py-3 text-bark-muted text-sm">${formatDate(r.createdAt)}</td>
	</tr>`;
}

export function recipientsPage(recipients: Recipient[]): string {
	const tableOrEmpty =
		recipients.length === 0
			? `<div class="flex flex-col items-center justify-center py-16 text-bark-muted">
				<p class="text-lg font-heading">No recipients yet</p>
				<p class="text-sm mt-1">Add your first recipient to get started.</p>
			</div>`
			: `<div class="overflow-x-auto">
				<table class="w-full text-left border-collapse">
					<thead>
						<tr class="border-b-2 border-cream-300 bg-cream-100">
							<th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Name</th>
							<th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Phone</th>
							<th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Payment</th>
							<th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Added</th>
						</tr>
					</thead>
					<tbody id="recipient-rows">
						${recipients.map(recipientRow).join("\n")}
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
			class="px-4 py-2 rounded-lg bg-amber text-white font-medium hover:bg-amber-dark transition-colors text-sm"
			data-on-click="@get('/recipients/new')">
			Add Recipient
		</button>
	</div>

	<div class="mb-4">
		<input
			type="text"
			placeholder="Search by name or phone&hellip;"
			data-bind:search
			class="w-full max-w-sm px-3 py-2 rounded-lg border border-cream-300 bg-white text-bark placeholder-bark-muted focus:outline-none focus:ring-2 focus:ring-amber focus:border-transparent text-sm" />
	</div>

	<div class="bg-white rounded-xl border border-cream-200 shadow-sm">
		${tableOrEmpty}
	</div>

	<div id="panel"></div>
</div>`;

	return layout("Recipients", body);
}
