import { createError, defineEventHandler, readRawBody } from "h3";
import { getSpotifyToken } from "../utils";

const ignorePathPrefixes = ["/quicksilver", "/ondemand-selector"];

const ignoreRequestHeaders = ["host"];

const ignoreResponseHeaders = [
	"content-encoding",
	"content-length",
	"transfer-encoding",
];

const proxyRequest = defineEventHandler(async (event) => {
	if (ignorePathPrefixes.some((prefix) => event.path.startsWith(prefix))) {
		return await event.respondWith(new Response(null, { status: 200 }));
	}

	for (const header of ignoreRequestHeaders) {
		event.headers.delete(header);
	}

	if (!event.headers.has("authorization")) {
		event.headers.set(
			"authorization",
			`Bearer ${await getSpotifyToken(
				event.context.cloudflare?.env || process.env
			)}`
		);
	}

	let buffer: Buffer | undefined;

	if (event.method === "POST") {
		const body = await readRawBody(event, "binary");
		if (body) buffer = Buffer.from(body, "binary");
	}

	const options: RequestInit = {
		method: event.method,
		headers: event.headers,
		body: buffer,
		redirect: "manual",
	};

	try {
		const res = await fetch(
			`https://spclient.wg.spotify.com${event.path}`,
			options
		);
		const body = Buffer.from(await res.arrayBuffer());
		const responseHeaders = new Headers();

		for (const [key, value] of res.headers.entries()) {
			if (!ignoreResponseHeaders.includes(key.toLowerCase())) {
				responseHeaders.append(key, value);
			}
		}

		if (!responseHeaders.has("content-type")) {
			const acceptHeader = event.headers.get("accept");
			const contentTypeHeader = res.headers.get("content-type");
			const contentType =
				acceptHeader && acceptHeader.split(",")[0] !== "*/*"
					? acceptHeader.split(",")[0]
					: contentTypeHeader || "application/json";
			responseHeaders.set("content-type", contentType);
		}

		await event.respondWith(
			new Response(body.length ? body : null, {
				status: res.status,
				headers: responseHeaders,
			})
		);
	} catch {
		throw createError({ status: 500 });
	}
});

export default {
	get: proxyRequest,
	post: proxyRequest,
};
