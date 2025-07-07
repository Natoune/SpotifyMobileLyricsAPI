import { toWebHandler } from "h3";
import { app } from "../dist/app.js";

const handler = toWebHandler(app);

export default {
	async fetch(request, env, ctx) {
		return handler(request, {
			cloudflare: { env, ctx },
		});
	},
};
