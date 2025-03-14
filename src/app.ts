import { createApp, createRouter } from "h3";
import { useCompressionStream } from "h3-compression";
import lyrics from "./functions/lyrics";
import proxy from "./functions/proxy";
import { initDatabase } from "./utils";

export const app = createApp({
	onBeforeResponse: useCompressionStream,
	onRequest: (event) => {
		if (process.env.LOG_REQUESTS !== "true") return;
		if (!event.path.startsWith("/color-lyrics")) return;
		try {
			const id = Math.random().toString(36).substr(2, 9);
			const ip =
				event.headers.get("x-real-ip") || event.req.socket.remoteAddress;
			console.log(`[${id}] (${ip}) ${event.method} ${event.path}`);
			console.log(`[${id}] (${ip}) Request headers:`, event.headers);
			// @ts-ignore
			event.id = id;
		} catch {}
	},
	onAfterResponse: (event, response) => {
		if (process.env.LOG_REQUESTS !== "true") return;
		// @ts-ignore
		if (!event.id) return;
		try {
			const ip =
				event.headers.get("x-real-ip") || event.req.socket.remoteAddress;

			if (event.res.statusCode.toString().startsWith("2")) {
				console.log(
					// @ts-ignore
					`[${event.id}] (${ip}) Response status: ${event.res.statusCode} ${event.res.statusMessage}`,
				);
				console.log(
					// @ts-ignore
					`[${event.id}] (${ip}) Response headers:`,
					event.res.getHeaders(),
				);
				response?.body &&
					console.log(
						// @ts-ignore
						`[${event.id}] (${ip}) Response body:`,
						response.body instanceof Uint8Array
							? `data:application/protobuf;base64,${Buffer.from(new TextDecoder().decode(response.body)).toString("base64")}`
							: response.body.toString(),
					);
			} else {
				console.error(
					// @ts-ignore
					`[${event.id}] (${ip}) Response status: ${event.res.statusCode} ${event.res.statusMessage}`,
				);
				console.error(
					// @ts-ignore
					`[${event.id}] (${ip}) Response headers:`,
					event.res.getHeaders(),
				);
				response?.body &&
					console.error(
						// @ts-ignore
						`[${event.id}] (${ip}) Response body:`,
						response.body.toString(),
					);
			}
		} catch {}
	},
});

initDatabase();

const router = createRouter();
app.use(router);

router.get("/**", proxy.get);
router.post("/**", proxy.post);

router.get("/color-lyrics/v2/track/:id", lyrics.get);
router.get("/color-lyrics/v2/track/:id/**", lyrics.get);
