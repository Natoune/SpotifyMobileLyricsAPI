import "dotenv/config";
import fs from "node:fs";
import https from "node:https";
import { join } from "node:path";
import app from "./app";

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

//====== START SERVER ======//

const port = Number.parseInt(process.env.PORT || "3000");
const server = https
	.createServer(
		{
			key:
				process.env.SSL_KEY ||
				fs.readFileSync(join(__dirname, "..", "ssl", "key.pem")),
			cert:
				process.env.SSL_CERT ||
				fs.readFileSync(join(__dirname, "..", "ssl", "cert.pem")),
			ca:
				process.env.SSL_CA ||
				fs.existsSync(join(__dirname, "..", "ssl", "ca.pem"))
					? fs.readFileSync(join(__dirname, "..", "ssl", "ca.pem"))
					: undefined,
		},
		app.callback(),
	)
	.listen(port, "0.0.0.0");

console.info(`Listening to https://0.0.0.0:${port} 🚀`);

export default server;
