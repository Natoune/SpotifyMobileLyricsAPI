import CryptoJS from "crypto-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import querystring from "node:querystring";
import type { SetOptions } from "redis";
import { createClient } from "redis";
import { Database } from "sqlite3";

export const useDatabase = process.env.DATABASE === "true";
export const database = new Database(join(__dirname, "..", "lyrics.db"));

let redisClient: ReturnType<typeof createClient>;

export let spotifyToken: {
	accessToken: string;
	accessTokenExpirationTimestampMs: number;
	[key: string]: any;
};

export const USER_AGENT =
	"Spotify Mobile Lyrics API (https://github.com/Natoune/SpotifyMobileLyricsAPI)";

export async function setSpotifyToken(token: any) {
	spotifyToken = token;
}

export async function initDatabase() {
	if (!useDatabase) return;

	database.serialize(() => {
		database.run(
			"CREATE TABLE IF NOT EXISTS l (i TEXT PRIMARY KEY, s INTEGER, l TEXT, b INTEGER, t INTEGER, h INTEGER)",
		);
	});
}

export async function redisGet(env: Record<string, any>, key: string) {
	if (env.sp_redis) {
		try {
			return await env.sp_redis.get(key);
		} catch {
			return null;
		}
	}

	if (env.REDIS_URL) {
		try {
			if (!redisClient) {
				redisClient = createClient({
					url: env.REDIS_URL,
				});
				await redisClient.connect();
			}

			return await redisClient.get(key);
		} catch {
			return null;
		}
	}

	return null;
}

export async function redisSet(
	env: Record<string, any>,
	key: string,
	value: string,
	options?: SetOptions,
) {
	if (env.sp_redis) {
		try {
			await env.sp_redis.put(key, value);
			return true;
		} catch {
			return false;
		}
	}

	if (env.REDIS_URL) {
		try {
			if (!redisClient) {
				redisClient = createClient({
					url: env.REDIS_URL,
				});
				await redisClient.connect();
			}

			await redisClient.set(key, value, options);
			return true;
		} catch {
			return false;
		}
	}

	return false;
}

export async function getSpotifyToken(
	env: Record<string, any>,
): Promise<string | null> {
	// Get token from memory
	if (
		spotifyToken?.accessToken &&
		spotifyToken?.accessTokenExpirationTimestampMs > Date.now()
	)
		return spotifyToken.accessToken;

	// Get token from cache
	const accessToken = await redisGet(env, "sp_access_token");

	if (accessToken) {
		spotifyToken = {
			accessToken: accessToken.split(":")[0],
			accessTokenExpirationTimestampMs: Number.parseInt(
				accessToken.split(":")[1],
			),
		};
	} else {
		// Get token from filesystem
		try {
			if (existsSync(join(__dirname, "..", "token"))) {
				const { accessToken, accessTokenExpirationTimestampMs } = JSON.parse(
					Buffer.from(
						readFileSync(join(__dirname, "..", "token"), "utf-8"),
						"hex",
					).toString(),
				);

				if (accessToken)
					spotifyToken = { accessToken, accessTokenExpirationTimestampMs };
			}
		} catch {}
	}

	if (
		spotifyToken?.accessToken &&
		spotifyToken?.accessTokenExpirationTimestampMs > Date.now()
	)
		return spotifyToken.accessToken;

	// Get token from API
	const SP_DC =
		env.SP_DC.split(",")[
			Math.floor(Math.random() * env.SP_DC.split(",").length)
		];
	spotifyToken = await fetch(
		"https://open.spotify.com/get_access_token?reason=transport&productType=web_player",
		{
			headers: {
				"User-Agent": USER_AGENT,
				Cookie: `sp_dc=${SP_DC}`,
			},
		},
	)
		.then((res) => res.json())
		.catch(() => null);

	if (!spotifyToken) return null;

	if (
		!(await redisSet(
			env,
			"sp_access_token",
			`${spotifyToken.accessToken}:${spotifyToken.accessTokenExpirationTimestampMs}`,
			{
				PXAT: spotifyToken.accessTokenExpirationTimestampMs,
			},
		))
	) {
		try {
			writeFileSync(
				join(__dirname, "..", "token"),
				Buffer.from(JSON.stringify(spotifyToken), "utf-8").toString("hex"),
			);
		} catch {}
	}

	return spotifyToken.accessToken;
}

export async function getTrackInfo(env: Record<string, any>, track_id: string) {
	// Get info from cache
	let trackInfo = await redisGet(env, `sp_track_${track_id}`);
	if (trackInfo) {
		try {
			const table = JSON.parse(
				Buffer.from(trackInfo, "base64").toString("utf-8"),
			);
			if (table.length === 4) {
				return {
					name: table[0],
					artist: table[1],
					album: table[2],
					duration: table[3],
				};
			}
		} catch {}
	}

	trackInfo = await fetch(`https://api.spotify.com/v1/tracks/${track_id}`, {
		headers: {
			Authorization: `Bearer ${await getSpotifyToken(env)}`,
		},
	})
		.then((res) => res.json())
		.then((data) => {
			return {
				name: data?.name,
				artist: data?.artists?.[0]?.name,
				album: data?.album?.name,
				duration: data?.duration_ms,
			};
		})
		.catch(() => null);

	if (!trackInfo)
		return { name: null, artist: null, album: null, duration: null };

	if (
		env.STORE_TRACK_INFO === "true" &&
		!!trackInfo.name &&
		!!trackInfo.artist &&
		!!trackInfo.album &&
		!!trackInfo.duration
	)
		await redisSet(
			env,
			`sp_track_${track_id}`,
			Buffer.from(
				JSON.stringify([
					trackInfo.name,
					trackInfo.artist,
					trackInfo.album,
					trackInfo.duration,
				]),
			).toString("base64"),
		);

	return trackInfo;
}

export async function fetchNetease(body) {
	// Found this in the simple-netease-cloud-music package (https://www.npmjs.com/package/simple-netease-cloud-music)

	const SECRET = "7246674226682325323F5E6544673A51";
	const password = Buffer.from(SECRET, "hex").toString("utf8");

	const hex = CryptoJS.AES.encrypt(
		JSON.stringify(body),
		CryptoJS.enc.Utf8.parse(password),
		{
			mode: CryptoJS.mode.ECB,
			padding: CryptoJS.pad.Pkcs7,
			format: CryptoJS.format.Hex,
		},
	).toString();

	const form = querystring.stringify({
		eparams: hex.toUpperCase(),
	});

	return await fetch("http://music.163.com/api/linux/forward", {
		method: body.method,
		headers: {
			referer: "https://music.163.com/",
			cookie:
				"os=pc; osver=Microsoft-Windows-10-Professional-build-10586-64bit; appver=2.0.3.131777; channel=netease; __remember_me=true",
			"user-agent":
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.115 Safari/537.36",
			"Content-Type": "application/x-www-form-urlencoded",
			"Content-Length": `${Buffer.byteLength(form)}`,
		},
		body: form,
	})
		.then((res) => res.json())
		.catch(() => null);
}
