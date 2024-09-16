import routes from "../src/app";

import type { VercelRequest, VercelResponse } from "@vercel/node";
export default async function handler(req: VercelRequest, res: VercelResponse) {
	const request = {
		ip: req.headers["x-real-ip"] as string,
		query: req.query,
		headers: req.headers,
		body: req.body,
		method: req.method,
	};
	let response: HandlerResponse;

	if (req.url === "/") {
		response = await routes["/"].handler();
	} else if (req.url?.startsWith("/color-lyrics/v2/track/")) {
		const id = (req.url.split("/").pop() || "").split("?")[0];
		response = await routes["/color-lyrics/v2/track/:id"].handler({
			request,
			params: { id },
			path: req.url,
		});
	} else {
		response = await routes["/*path"].handler({
			request,
			path: req.url || "",
		});
	}

	for (const [key, value] of Object.entries(response.headers)) {
		res.setHeader(key, value);
	}
	res.status(response.status).send(response.body);
}
