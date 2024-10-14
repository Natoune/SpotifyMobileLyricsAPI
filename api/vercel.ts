import type { VercelRequest, VercelResponse } from "@vercel/node";
import { toWebHandler } from "h3";
import { app } from "../src/app";

const webHandler = toWebHandler(app);

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (!req.url) {
		res.status(400).send("Missing URL");
		return;
	}

	const url = new URL(req.url, `https://${process.env.VERCEL_URL}`);
	for (const [key, value] of Object.entries(req.query)) {
		if (Array.isArray(value)) {
			for (const val of value) {
				url.searchParams.append(key, val);
			}
			continue;
		}
		url.searchParams.set(key, value);
	}

	let body: Buffer | undefined;
	if (req.headers["content-length"]) {
		const chunks: Uint8Array[] = [];
		for await (const chunk of req) {
			chunks.push(chunk);
		}
		body = Buffer.concat(chunks);
	}

	const request = new Request(url, {
		method: req.method,
		headers: new Headers(
			Object.entries(req.headers).filter(
				([, value]) => typeof value === "string",
			) as [string, string][],
		),
		body: body || undefined,
	});

	const response = await webHandler(request);

	for (const [key, value] of response.headers) {
		res.setHeader(key, value);
	}

	const responseBody = await response.arrayBuffer();
	const responseBuffer = Buffer.from(responseBody);
	res.status(response.status).send(responseBuffer);
}
