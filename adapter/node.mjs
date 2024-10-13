import "dotenv/config";
import { toNodeListener } from "h3";
import fs from "node:fs";
import { createServer as httpServer } from "node:http";
import { createServer as httpsServer } from "node:https";
import { app } from "../dist/app.js";

const listener = toNodeListener(app);

if (fs.existsSync("certs/private.key") && fs.existsSync("certs/cert.pem")) {
	const options = {
		key: fs.readFileSync("certs/private.key"),
		cert: fs.readFileSync("certs/cert.pem"),
	};
	const server = httpsServer(options, listener);
	server.listen(process.env.PORT || 443);
} else {
	const server = httpServer(listener);
	server.listen(process.env.PORT || 80);
}
