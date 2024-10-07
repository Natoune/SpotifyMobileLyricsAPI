import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PassThrough } from "node:stream";
import { gunzipSync } from "node:zlib";
import { getSpotifyToken } from "../utils";

export default async function handler(req: VercelRequest, res: VercelResponse) {
	const url = `https://spclient.wg.spotify.com${req.url}`;

	// I don't know what this endpoint does, but we don't need it
	if (url.includes("/quicksilver/")) return res.status(200).end();

	const {
		host,
		authorization,
		"content-length": _,
		"content-encoding": contentEncoding,
		...headers
	} = req.headers;

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
	if (contentEncoding === "gzip") {
		bodyString = gunzipSync(new Uint8Array(buffer)).toString("utf-8");
		bodyLength = Buffer.byteLength(bodyString);
	} else {
		bodyString = buffer.toString("utf-8");
		bodyLength = Buffer.byteLength(bodyString);
	}

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: new Headers(
				Object.entries({
					...headers,
					"Content-Length": bodyLength.toString(),
					Authorization: authorization || `Bearer ${await getSpotifyToken()}`,
				}) as [string, string][],
			),
			body: bodyString,
		});

		const response_body = await response.text();
		const response_headers = Object.fromEntries(response.headers.entries());

		for (const [key, value] of Object.entries(response_headers)) {
			if (
				!["content-encoding", "content-length", "transfer-encoding"].includes(
					key,
				)
			) {
				res.setHeader(key, value);
			}
		}

		if (!response_headers["content-type"]) {
			res.setHeader(
				"content-type",
				req.headers["content-type"] || "application/json",
			);
		}

		res.send(response_body);
	} catch (error) {
		res.status(500).end();
	}
}
