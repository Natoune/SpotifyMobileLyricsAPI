import type { VercelRequest, VercelResponse } from "@vercel/node";
import { join } from "node:path";
import protobuf from "protobufjs";
import { createClient } from "redis";

let redisClient: ReturnType<typeof createClient>;

async function getProto(name: string): Promise<protobuf.Root> {
	return await new Promise((resolve, reject) => {
		protobuf.load(
			join(__dirname, "..", "protos", `${name}.proto`),
			(err, root) => {
				if (err || !root) reject(err);
				else resolve(root);
			},
		);
	});
}

async function getSpotifyToken() {
	if (process.env.REDIS_URL) {
		try {
			if (!redisClient) {
				redisClient = createClient({
					url: process.env.REDIS_URL,
				});
				await redisClient.connect();
			}

			const accessToken = await redisClient.get("sp_access_token");
			if (accessToken) return accessToken;
		} catch {}
	}

	const { accessToken, accessTokenExpirationTimestampMs } = await fetch(
		"https://open.spotify.com/get_access_token?reason=transport&productType=web_player",
		{
			headers: {
				Cookie: `sp_dc=${process.env.SP_DC}`,
			},
		},
	).then((res) => res.json());

	if (redisClient) {
		try {
			await redisClient.set("sp_access_token", accessToken, {
				PXAT: accessTokenExpirationTimestampMs,
			});
		} catch {}
	}

	return accessToken;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (!req.url) return res.status(404).send("Not Found");

	const track_id = req.url.split("/").pop()?.split("?")[0];

	const proto = await getProto("lyrics");
	const RootMessage = proto.lookupType("Root");

	let market = "US";
	if (req.query.market === "from_token") {
		market = req.headers["x-vercel-ip-country"] as string;
	} else if (req.query.market) {
		market = req.query.market as string;
	}

	const data = await fetch(
		`https://spclient.wg.spotify.com/color-lyrics/v2/track/${track_id}?format=json&vocalRemoval=false&market=${market}`,
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

	res.setHeader("Content-Type", "application/protobuf");
	res.status(200).send(buffer);
}
