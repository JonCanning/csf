import { layout } from "./layout.ts";

export function loginPage(error?: string): string {
	const errorHtml = error
		? `<div id="error-message" class="alert-error mb-5 animate-shake">${escapeHtml(error)}</div>`
		: "";

	return layout(
		"Login",
		`
	<div class="flex items-center justify-center min-h-screen p-4">
		<div class="card bg-cream-50 p-10 w-full max-w-sm animate-fade-in">
			<h1 class="font-heading font-bold text-2xl text-bark mb-1">Community Support Fund</h1>
			<p class="text-bark-muted text-sm mb-8">Volunteer Portal</p>

			<form method="POST" action="/login">
				${errorHtml}

				<label for="name" class="block text-sm font-semibold text-bark-light mb-1">Name</label>
				<input
					type="text"
					id="name"
					name="name"
					autocomplete="username"
					required
					class="input mb-5"
				>

				<label for="password" class="block text-sm font-semibold text-bark-light mb-1">Password</label>
				<input
					type="password"
					id="password"
					name="password"
					autocomplete="current-password"
					required
					class="input mb-5"
				>

				<button type="submit" class="btn btn-primary w-full py-3">
					Sign In
				</button>
			</form>
		</div>
	</div>
`,
	);
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
