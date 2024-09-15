import type { VercelRequest, VercelResponse } from "@vercel/node";
import routes from "../src/app";

export default async function handler(req: VercelRequest, res: VercelResponse) {
	let response: HandlerResponse;

	if (req.url === "/") {
		response = await routes["/"].handler();
	} else if (req.url?.startsWith("/color-lyrics/v2/track/")) {
		const id = req.url.split("/").pop() || "";
		response = await routes["/color-lyrics/v2/track/:id"].handler({
			request: { ...req, ip: req.headers["x-real-ip"] as string },
			params: { id },
			path: req.url,
		});
	} else {
		response = await routes["/*path"].handler({
			request: { ...req, ip: req.headers["x-real-ip"] as string },
			path: req.url || "",
		});
	}

	for (const [key, value] of Object.entries(response.headers)) {
		res.setHeader(key, value);
	}
	res.status(response.status).send(response.body);
}
