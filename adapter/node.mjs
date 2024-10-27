import "dotenv/config";
import { toNodeListener } from "h3";
import fs from "node:fs";
import { createServer as httpServer } from "node:http";
import { createServer as httpsServer } from "node:https";
import { app } from "../dist/app.js";

const listener = toNodeListener(app);

if (
	(process.env.SSL_KEY && process.env.SSL_CERT) ||
	fs.existsSync("certs/private.key") ||
	fs.existsSync("certs/cert.pem")
) {
	const options = {
		key: process.env.SSL_KEY || fs.readFileSync("certs/private.key"),
		cert: process.env.SSL_CERT || fs.readFileSync("certs/cert.pem"),
	};
	const server = httpsServer(options, listener);
	server.listen(process.env.PORT || 443, () => {
		console.log(
			`Listening on ${server.address().address}:${server.address().port}`,
		);
	});
} else {
	const server = httpServer(listener);
	server.listen(process.env.PORT || 80, () => {
		console.log(
			`Listening on ${server.address().address}:${server.address().port}`,
		);
	});
}
