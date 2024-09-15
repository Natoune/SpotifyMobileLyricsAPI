import "dotenv/config";
import Koa from "koa";
import Router from "koa-router";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { join } from "node:path";
import zlib from "node:zlib";
import { get } from "simple-get";
import tarstream from "tar-stream";
import routes from "./app";

//========= CHECKS =========//

// Check if MaxMind database exists
if (!fs.existsSync(join(__dirname, "..", "db", "GeoLite2-Country.mmdb"))) {
	if (process.env.MAXMIND_ACCOUNT_ID && process.env.MAXMIND_LICENSE_KEY) {
		console.error("MaxMind database not found! Downloading...");

		const file = fs.createWriteStream(
			join(__dirname, "..", "db", "GeoLite2-Country.mmdb.tar.gz"),
		);

		get(
			{
				url: "https://download.maxmind.com/geoip/databases/GeoLite2-Country/download?suffix=tar.gz",
				headers: {
					Authorization: `Basic ${Buffer.from(
						`${process.env.MAXMIND_ACCOUNT_ID}:${process.env.MAXMIND_LICENSE_KEY}`,
					).toString("base64")}`,
				},
			},
			(err, res) => {
				if (err || !res) {
					console.error("Failed to download MaxMind database!");
					process.exit(1);
				}

				res.pipe(file);

				file.on("finish", () => {
					file.close();

					const extract = tarstream.extract();
					const readStream = fs.createReadStream(
						join(__dirname, "..", "db", "GeoLite2-Country.mmdb.tar.gz"),
					);

					readStream.pipe(zlib.createGunzip()).pipe(extract);

					extract.on("entry", (header, stream, next) => {
						if (header.name.endsWith("GeoLite2-Country.mmdb")) {
							stream.pipe(
								fs.createWriteStream(
									join(__dirname, "..", "db", "GeoLite2-Country.mmdb"),
								),
							);
						}
						stream.on("end", next);
						stream.resume();
					});

					extract.on("finish", () => {
						fs.unlinkSync(
							join(__dirname, "..", "db", "GeoLite2-Country.mmdb.tar.gz"),
						);
						console.info("MaxMind database downloaded successfully!");
					});

					extract.on("error", (e) => {
						console.error("Failed to extract MaxMind database!", e);
						process.exit(1);
					});
				});
			},
		);
	} else {
		console.error("MaxMind database not found and no credentials provided.");
		process.exit(1);
	}
}

// Check if Spotify token is valid
if (!process.env.SP_DC) {
	console.error("Spotify cookie not found!");
	process.exit(1);
}

if (!process.env.VERCEL) {
	fetch(
		"https://open.spotify.com/get_access_token?reason=transport&productType=web_player",
		{
			headers: {
				Cookie: `sp_dc=${process.env.SP_DC}`,
			},
		},
	)
		.then(async (res) => {
			if (res.status !== 200) {
				console.error("Invalid Spotify cookie!");
				process.exit(1);
			}
		})
		.catch(() => {
			console.error("Invalid Spotify cookie!");
			process.exit(1);
		});
}

//======= KOA SERVER =======//

if (!process.env.VERCEL) {
	// Routes
	const app = new Koa();
	const router = new Router();

	function send(ctx, res) {
		ctx.status = res.status;
		ctx.body = res.body;
		for (const [key, value] of Object.entries(res.headers)) {
			ctx.set(key, value);
		}
	}

	router.get("/", async (ctx) => {
		send(ctx, await routes["/"].handler());
	});

	router.get("/color-lyrics/v2/track/:id", async (ctx) => {
		send(ctx, await routes["/color-lyrics/v2/track/:id"].handler(ctx));
	});

	router.all("/*path", async (ctx) => {
		send(ctx, await routes["/*path"].handler(ctx));
	});

	app.use(router.routes());

	// Server
	let server: https.Server | http.Server;
	const port = Number.parseInt(process.env.PORT || "3000");
	const isHttps =
		(process.env.SSL_KEY && process.env.SSL_CERT) ||
		(fs.existsSync(join(__dirname, "..", "ssl", "key.pem")) &&
			fs.existsSync(join(__dirname, "..", "ssl", "cert.pem")));

	if (isHttps)
		server = https.createServer(
			{
				key:
					process.env.SSL_KEY ||
					fs.readFileSync(join(__dirname, "..", "ssl", "key.pem")),
				cert:
					process.env.SSL_CERT ||
					fs.readFileSync(join(__dirname, "..", "ssl", "cert.pem")),
				ca: process.env.SSL_CA
					? process.env.SSL_CA
					: fs.existsSync(join(__dirname, "..", "ssl", "ca.pem"))
						? fs.readFileSync(join(__dirname, "..", "ssl", "ca.pem"))
						: undefined,
			},
			app.callback(),
		);
	else server = http.createServer(app.callback());

	server.listen(port, "0.0.0.0", () => {
		console.log(
			`Server running on ${isHttps ? "https" : "http"}://0.0.0.0:${port} 🚀`,
		);
	});
}

//====== VERCEL SERVER ======//

/*export default async function handler(req: VercelRequest, res: VercelResponse) {
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
*/
