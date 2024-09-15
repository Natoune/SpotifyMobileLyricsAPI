import "dotenv/config";
import Koa from "koa";
import Router from "koa-router";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { join } from "node:path";
import routes from "./app";

//========= CHECKS =========//

// Check if MaxMind database exists
if (!fs.existsSync(join(__dirname, "..", "db", "GeoLite2-Country.mmdb"))) {
	console.error("MaxMind database not found!");
	process.exit(1);
}

// Check if Spotify token is valid
if (!process.env.SP_DC) {
	console.error("Spotify cookie not found!");
	process.exit(1);
}

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

//======= KOA SERVER =======//

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
