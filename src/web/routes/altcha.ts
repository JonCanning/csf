import { createChallenge } from "altcha-lib";

export function createAltchaRoutes(hmacKey: string) {
	return {
		async challenge(): Promise<Response> {
			const challenge = await createChallenge({ hmacKey, maxNumber: 50000 });
			return new Response(JSON.stringify(challenge), {
				headers: { "Content-Type": "application/json" },
			});
		},
	};
}
