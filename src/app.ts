import maxmind, { type CountryResponse, type Reader } from "maxmind";
import { join } from "node:path";
import protobuf from "protobufjs";

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

export default {
	"/": {
		async handler(): Promise<HandlerResponse> {
			return {
				status: 204,
				headers: {},
				body: "",
			};
		},
	},
	"/color-lyrics/v2/track/:id": {
		async handler(
			ctx: HandlerContext & { params: Record<string, string> },
		): Promise<HandlerResponse> {
			const proto = await getProto("lyrics");
			const RootMessage = proto.lookupType("Root");

			let market = "US";
			if (ctx.request.query.market === "from_token") {
				const ip = ctx.request.ip;
				market =
					ctx.request.headers["x-vercel-ip-country"] ||
					ctx.request.headers["cf-ipcountry"] ||
					(await findCountry(ip));
			} else if (ctx.request.query.market) {
				market = ctx.request.query.market as string;
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
				}))
				.catch(() => ({}));

			const errMsg = RootMessage.verify(data);
			if (errMsg) {
				return {
					status: 400,
					headers: {},
					body: errMsg,
				};
			}

			const message = RootMessage.create(data);
			const buffer = RootMessage.encode(message).finish();

			return {
				status: 200,
				headers: {
					"Content-Type": "application/protobuf",
				},
				body: buffer,
			};
		},
	},
	"/*path": {
		async handler(ctx: HandlerContext): Promise<HandlerResponse> {
			const response = await fetch(
				`https://spclient.wg.spotify.com${ctx.path}`,
				{
					method: ctx.request.method,
					headers: Object.entries(ctx.request.headers).map(([key, value]) => [
						key,
						value as string,
					]) as [string, string][],
				},
			);

			return {
				status: response.status,
				headers: Object.fromEntries(response.headers.entries()),
				body: await response.arrayBuffer(),
			};
		},
	},
};
