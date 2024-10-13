import { toWebHandler } from "h3";
import { app } from "../dist/app.js";

const handler = toWebHandler(app);

if (
	(await Bun.file("certs/private.key").exists()) &&
	(await Bun.file("certs/cert.pem").exists())
) {
	const options = {
		port: process.env.PORT || 443,
		fetch: handler,
		tls: {
			key: Bun.file("certs/private.key"),
			cert: Bun.file("certs/cert.pem"),
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
