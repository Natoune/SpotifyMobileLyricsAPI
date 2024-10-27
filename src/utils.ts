import * as protobuf from "@bufbuild/protobuf";
import CryptoJS from "crypto-js";
import LanguageDetect from "languagedetect";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import querystring from "node:querystring";
import { createClient } from "redis";
import { RootSchema } from "./gen/lyrics_pb";

let redisClient: ReturnType<typeof createClient>;

const langDetector = new LanguageDetect();
langDetector.setLanguageType("iso2");

let env: Record<string, any>;

let spotifyToken: {
	accessToken: string;
	accessTokenExpirationTimestampMs: number;
	[key: string]: any;
};

const ua =
	"Spotify Mobile Lyrics API (https://github.com/Natoune/SpotifyMobileLyricsAPI)";

export async function getSpotifyToken(
	setEnv?: Record<string, any>,
): Promise<string | null> {
	if (setEnv) env = setEnv;

	if (
		spotifyToken?.accessToken &&
		spotifyToken?.accessTokenExpirationTimestampMs > Date.now()
	)
		return spotifyToken.accessToken;

	if (env.sp_redis) {
		try {
			const accessToken = await env.sp_redis.get("sp_access_token");
			if (
				accessToken &&
				Number.parseInt(accessToken.split(":")[1]) > Date.now()
			)
				return accessToken.split(":")[0];
		} catch {}
	} else if (env.REDIS_URL) {
		try {
			if (!redisClient) {
				redisClient = createClient({
					url: env.REDIS_URL,
				});
				await redisClient.connect();
			}

			const accessToken = await redisClient.get("sp_access_token");
			if (accessToken) return accessToken;
		} catch {}
	} else {
		try {
			if (existsSync(join(__dirname, "..", "token"))) {
				const { accessToken, accessTokenExpirationTimestampMs } = JSON.parse(
					Buffer.from(
						readFileSync(join(__dirname, "..", "token"), "utf-8"),
						"hex",
					).toString(),
				);

				if (accessTokenExpirationTimestampMs > Date.now()) return accessToken;
			}
		} catch {}
	}

	const SP_DC =
		env.SP_DC.split(",")[
			Math.floor(Math.random() * env.SP_DC.split(",").length)
		];
	spotifyToken = await fetch(
		"https://open.spotify.com/get_access_token?reason=transport&productType=web_player",
		{
			headers: {
				"User-Agent": ua,
				Cookie: `sp_dc=${SP_DC}`,
			},
		},
	)
		.then((res) => res.json())
		.catch(() => null);

	if (!spotifyToken) return null;

	if (env.sp_redis) {
		try {
			await env.sp_redis.put(
				"sp_access_token",
				`${spotifyToken.accessToken}:${spotifyToken.accessTokenExpirationTimestampMs}`,
			);
		} catch {}
	} else if (redisClient) {
		try {
			await redisClient.set("sp_access_token", spotifyToken.accessToken, {
				PXAT: spotifyToken.accessTokenExpirationTimestampMs,
			});
		} catch {}
	}

	try {
		writeFileSync(
			join(__dirname, "..", "token"),
			Buffer.from(JSON.stringify(spotifyToken), "utf-8").toString("hex"),
		);
	} catch {}

	return spotifyToken.accessToken;
}

async function getTrackInfo(track_id: string) {
	return await fetch(`https://api.spotify.com/v1/tracks/${track_id}`, {
		headers: {
			Authorization: `Bearer ${await getSpotifyToken()}`,
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
		.catch(() => ({ name: null, artist: null, album: null, duration: null }));
}

async function getSpotifyLyrics(id: string, market: string) {
	const lyrics = await fetch(
		`https://spclient.wg.spotify.com/color-lyrics/v2/track/${id}?format=json&vocalRemoval=false&market=${market}`,
		{
			headers: {
				"app-platform": "WebPlayer",
				"User-Agent": ua,
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
		.catch(() => null);

	if (!lyrics || !lyrics.lyrics?.lines || !lyrics.lyrics?.lines.length)
		return null;

	return lyrics;
}

async function fetchNetease(body) {
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

async function getNeteaseLyrics(track_id: string) {
	const { name, artist } = await getTrackInfo(track_id);
	if (!name || !artist) return null;

	const id = await fetchNetease({
		method: "POST",
		params: {
			s: `${name} ${artist}`,
			type: 1,
			limit: 1,
			total: true,
		},
		url: "https://music.163.com/api/cloudsearch/pc",
	})
		.then((data) => data.result?.songs?.[0]?.id)
		.catch(() => null);

	if (!id) return null;

	const lyrics = await fetchNetease({
		method: "POST",
		params: { id, lv: 1, kv: 1, tv: -1 },
		url: "https://music.163.com/api/song/lyric",
	})
		.then((data) => data.lrc?.lyric)
		.catch(() => null);

	if (!lyrics) return null;

	let lines: string[] = lyrics.split("\n");
	let i = 0;
	lines = lines.filter((line) => line.trim() !== "");
	lines = lines.filter((line) => {
		if (line.includes("作词 :") || line.includes("作曲 :")) return false;
		if (line.split("]")[1].trim() === "" && i === 0) return;
		i++;
		return true;
	});
	const synced_lines = lines.filter((line) =>
		/^\[\d{2}:\d{2}\.\d{2,3}\]/.test(line),
	);

	if (!lines.length) return null;

	const language = langDetector.detect(lines.join("\n"));

	const lyrics_obj = {
		lyrics: {
			syncType: synced_lines.length ? 1 : undefined,
			lines: synced_lines.length
				? synced_lines.map((line) => ({
						startTimeMs:
							Number.parseInt(line.slice(1, 3)) * 60 * 1000 +
							Number.parseInt(line.slice(4, 6)) * 1000 +
							Number.parseInt(line.split("]")[0].split(".")[1]),
						words: line.split("]").slice(1).join("").trim(),
						syllabes: [],
						endTimeMs: 0,
					}))
				: lines.map((line) => ({
						startTimeMs: 0,
						words: line.trim(),
						syllabes: [],
						endTimeMs: 0,
					})),
			provider: "netease",
			providerLyricsId: `${id}`,
			providerDisplayName: "NetEase Cloud Music",
			language: language?.[0]?.[0] || "en",
		},
	};

	return lyrics_obj;
}

async function getLRCLibLyrics(track_id: string) {
	const { name, artist, album, duration } = await getTrackInfo(track_id);
	if (!name || !artist) return null;

	const url = new URL("https://lrclib.net/api/get");
	url.searchParams.append("track_name", name);
	url.searchParams.append("artist_name", artist);
	if (album) url.searchParams.append("album_name", album);
	if (duration)
		url.searchParams.append("duration", Math.round(duration / 1000).toString());

	const lyrics = await fetch(url.toString(), {
		headers: {
			"User-Agent":
				"Spotify Mobile Lyrics API (https://github.com/Natoune/SpotifyMobileLyricsAPI)",
		},
	}).then((res) => res.json());

	if (!lyrics?.plainLyrics && !lyrics?.syncedLyrics) return null;

	const lines = lyrics.plainLyrics?.split("\n");
	const synced_lines = lyrics.syncedLyrics
		? lyrics.syncedLyrics
				.split("\n")
				.filter((line) => /^\[\d{2}:\d{2}\.\d{2,3}\]/.test(line))
		: null;

	const language = langDetector.detect(lines.join("\n"));

	const lyrics_obj = {
		lyrics: {
			syncType: synced_lines ? 1 : undefined,
			lines: synced_lines
				? synced_lines.map((line) => ({
						startTimeMs:
							Number.parseInt(line.slice(1, 3)) * 60 * 1000 +
							Number.parseInt(line.slice(4, 6)) * 1000 +
							Number.parseInt(line.split("]")[0].split(".")[1]),
						words: line.split("]").slice(1).join("").trim(),
						syllabes: [],
						endTimeMs: 0,
					}))
				: lines.map((line) => ({
						startTimeMs: 0,
						words: line.trim(),
						syllabes: [],
						endTimeMs: 0,
					})),
			provider: "lrclib",
			providerLyricsId: `${lyrics.id}`,
			providerDisplayName: "LRCLIB",
			language: language?.[0]?.[0] || "en",
		},
	};

	return lyrics_obj;
}

export async function fetchLyrics(
	track_id: string,
	market: string,
	setEnv: Record<string, any>,
) {
	env = setEnv;

	const lyricsFetchers = [
		() => getSpotifyLyrics(track_id, market),
		() => getNeteaseLyrics(track_id),
		() => getLRCLibLyrics(track_id),
	];

	let colors = {
		background: -9079435,
		text: -16777216,
		highlightText: -1,
	};
	let unsyncedLyrics: Uint8Array | null = null;

	for (const fetcher of lyricsFetchers) {
		const lyrics_obj = await fetcher();

		if (lyrics_obj) {
			if (lyrics_obj.colors) colors = lyrics_obj.colors;
			else lyrics_obj.colors = colors;

			const proto = protobuf.create(RootSchema, lyrics_obj);

			if (lyrics_obj.syncType === 1)
				return protobuf.toBinary(RootSchema, proto);

			if (!unsyncedLyrics)
				unsyncedLyrics = protobuf.toBinary(RootSchema, proto);
		}
	}

	return unsyncedLyrics;
}
