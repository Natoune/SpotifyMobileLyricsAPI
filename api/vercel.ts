import type { VercelRequest, VercelResponse } from "@vercel/node";
import { toWebHandler } from "h3";
import { PassThrough } from "node:stream";
import { gunzipSync } from "node:zlib";
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

	const body = req.pipe(new PassThrough());
	const buffer = await new Promise<Buffer>((resolve, reject) => {
		const chunks: Buffer[] = [];
		body.on("data", (chunk) => chunks.push(chunk));
		body.on("end", () =>
			resolve(Buffer.concat(chunks.map((chunk) => new Uint8Array(chunk)))),
		);
		body.on("error", reject);
	});

	let bodyString: string;
	let bodyLength: number;
	if (req.headers["content-encoding"] === "gzip") {
		bodyString = gunzipSync(new Uint8Array(buffer)).toString("utf-8");
		bodyLength = Buffer.byteLength(bodyString);
	} else {
		bodyString = buffer.toString("utf-8");
		bodyLength = Buffer.byteLength(bodyString);
	}

	const request = new Request(url, {
		method: req.method,
		headers: new Headers(
			Object.entries(req.headers).filter(
				([, value]) => typeof value === "string",
			) as [string, string][],
		),
		body: req.method === "GET" ? undefined : bodyString,
	});
	request.headers.set("content-length", bodyLength.toString());

	const response = await webHandler(request);

	for (const [key, value] of response.headers) {
		res.setHeader(key, value);
	}

	const responseBody = await response.arrayBuffer();
	const responseBuffer = Buffer.from(responseBody);
	res.status(response.status).send(responseBuffer);
}
