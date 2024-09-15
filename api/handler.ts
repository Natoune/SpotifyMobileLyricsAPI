import type { VercelRequest, VercelResponse } from "@vercel/node";
import fs from "node:fs";
import { join } from "node:path";
import routes from "../src/app";

export default async function handler(req: VercelRequest, res: VercelResponse) {
	//========= CHECKS =========//

	// Check if MaxMind database exists
	if (!fs.existsSync(join(__dirname, "..", "db", "GeoLite2-Country.mmdb"))) {
		console.error("MaxMind database not found!");
		return res.status(500).send("MaxMind database not found!");
	}

	// Check if Spotify token exists
	if (!process.env.SP_DC) {
		console.error("Spotify cookie not found!");
		return res.status(500).send("Spotify cookie not found!");
	}

	//======== ROUTES =========//

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
