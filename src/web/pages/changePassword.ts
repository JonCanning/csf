import { layout } from "./layout.ts";

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export function changePasswordPage(error?: string): string {
	const errorHtml = error
		? `<div id="error-message" class="alert-error mb-5 animate-shake">${escapeHtml(error)}</div>`
		: "";

	return layout(
		"Change Password",
		`
	<div class="flex items-center justify-center min-h-screen p-4">
		<div class="card bg-cream-50 p-10 w-full max-w-sm animate-fade-in">
			<h1 class="font-heading font-bold text-2xl text-bark mb-1">Change Password</h1>
			<p class="text-bark-muted text-sm mb-8">Please set a new password to continue.</p>

			<form method="POST" action="/change-password">
				${errorHtml}

				<label for="currentPassword" class="block text-sm font-semibold text-bark-light mb-1">Current Password</label>
				<input
					type="password"
					id="currentPassword"
					name="currentPassword"
					autocomplete="current-password"
					required
					class="input mb-5"
				>

				<label for="newPassword" class="block text-sm font-semibold text-bark-light mb-1">New Password</label>
				<input
					type="password"
					id="newPassword"
					name="newPassword"
					autocomplete="new-password"
					required
					class="input mb-5"
				>

				<label for="confirmPassword" class="block text-sm font-semibold text-bark-light mb-1">Confirm New Password</label>
				<input
					type="password"
					id="confirmPassword"
					name="confirmPassword"
					autocomplete="new-password"
					required
					class="input mb-5"
				>

				<button type="submit" class="btn btn-primary w-full py-3">
					Change Password
				</button>
			</form>
		</div>
	</div>
`,
	);
}
