import "dotenv/config";
import { toWebHandler } from "h3";
import { app } from "../dist/app.js";

const handler = toWebHandler(app);

if (
	(process.env.SSL_KEY && process.env.SSL_CERT) ||
	((await Bun.file("certs/private.key").exists()) &&
		(await Bun.file("certs/cert.pem").exists()))
) {
	const options = {
		port: process.env.PORT || 443,
		fetch: handler,
		tls: {
			key: process.env.SSL_KEY || (await Bun.file("certs/private.key").text()),
			cert: process.env.SSL_CERT || (await Bun.file("certs/cert.pem").text()),
		},
	};
	const server = Bun.serve(options);
} else {
	const options = {
		port: process.env.PORT || 80,
		fetch: handler,
	};
	const server = Bun.serve(options);
}
