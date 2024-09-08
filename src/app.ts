import Koa from "koa";
import Router from "koa-router";
import sslify from "koa-sslify";
import maxmind, { type CountryResponse, type Reader } from "maxmind";
import { join } from "node:path";
import protobuf from "protobufjs";

const app = new Koa();
const router = new Router();

app.use(sslify());

let maxmindReader: Reader<CountryResponse>;
let spotifyToken: { token: string; expires: number };
const protos: { [key: string]: protobuf.Root } = {};

async function findCountry(ip: string) {
	if (!maxmind.validate(ip)) return "US";

	if (!maxmindReader)
		maxmindReader = await maxmind.open<CountryResponse>(
			join(__dirname, "..", "db", "GeoLite2-Country.mmdb"),
		);

	const response = maxmindReader.get(ip);
	if (!response?.country) return "US";
	return response.country.iso_code;
}

async function getSpotifyToken() {
	if (!spotifyToken || Date.now() >= spotifyToken.expires) {
		const { accessToken, accessTokenExpirationTimestampMs } = await fetch(
			"https://open.spotify.com/get_access_token?reason=transport&productType=web_player",
			{
				headers: {
					Cookie: `sp_dc=${process.env.SP_DC}`,
				},
			},
		).then((res) => res.json());

		spotifyToken = {
			token: accessToken,
			expires: accessTokenExpirationTimestampMs,
		};
	}

	return spotifyToken.token;
}

async function getProto(name: string) {
	if (!protos[name]) {
		protos[name] = await new Promise((resolve, reject) => {
			protobuf.load(
				join(__dirname, "..", "protos", `${name}.proto`),
				(err, root) => {
					if (err || !root) reject(err);
					else resolve(root);
				},
			);
		});
	}

	return protos[name];
}

router.get("/", (ctx: Koa.Context) => {
	ctx.status = 204;
});

router.get("/color-lyrics/v2/track/:id", async (ctx: Koa.Context) => {
	const proto = await getProto("lyrics");
	const RootMessage = proto.lookupType("Root");

	let market = "US";
	if (ctx.query.market === "from_token") {
		const ip = ctx.request.ip;
		market = await findCountry(ip);
	} else if (ctx.query.market) {
		market = ctx.query.market as string;
	}
	const data = await fetch(
		`https://spclient.wg.spotify.com/color-lyrics/v2/track/${ctx.params.id}?format=json&vocalRemoval=false&market=${market}`,
		{
			headers: {
				"app-platform": "WebPlayer",
				Authorization: `Bearer ${await getSpotifyToken()}`,
			},
		},
	)
		.then((res) => res.json())
		.then((data) => ({
			...data,
			lyrics: {
				...data.lyrics,
				syncType: data.lyrics.syncType === "LINE_SYNCED" ? 1 : undefined,
				lines: data.lyrics.lines.map((line) => ({
					...line,
					startTimeMs: Number.parseInt(line.startTimeMs),
				})),
			},
		}));

	const errMsg = RootMessage.verify(data);
	if (errMsg) {
		ctx.status = 400;
		ctx.body = errMsg;
		return;
	}

	const message = RootMessage.create(data);
	const buffer = RootMessage.encode(message).finish();

	ctx.set("Content-Type", "application/protobuf");
	ctx.body = buffer;
});

router.all("/:path(.*)", async (ctx: Koa.Context) => {
	const response = await fetch(`https://spclient.wg.spotify.com${ctx.path}`, {
		method: ctx.request.method,
		headers: Object.entries(ctx.request.headers).map(([key, value]) => [
			key,
			value as string,
		]) as [string, string][],
	});

	ctx.status = response.status;
	ctx.body = response.body;
	for (const [key, value] of response.headers.entries()) {
		ctx.set(key, value);
	}
});

app.use(router.routes());

export default app;
