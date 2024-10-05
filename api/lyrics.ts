import type { VercelRequest, VercelResponse } from "@vercel/node";
import LanguageDetect from "languagedetect";
import crypto from "node:crypto";
import { join } from "node:path";
import querystring from "node:querystring";
import protobuf from "protobufjs";
import { createClient } from "redis";

let redisClient: ReturnType<typeof createClient>;
const langDetector = new LanguageDetect();
langDetector.setLanguageType("iso2");

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

	const proto = await getProto("lyrics");
	const RootMessage = proto.lookupType("Root");

	const errMsg = RootMessage.verify(lyrics);
	if (errMsg) return null;

	const message = RootMessage.create(lyrics);
	const buffer = RootMessage.encode(message).finish();

	return buffer;
}

async function fetchNetease(body) {
	// Found this in the simple-netease-cloud-music package (https://www.npmjs.com/package/simple-netease-cloud-music)

	const SECRET = "7246674226682325323F5E6544673A51";
	const password = Buffer.from(SECRET, "hex").toString("utf8");

	const cipher = crypto.createCipheriv("aes-128-ecb", password, "");
	const hex =
		cipher.update(JSON.stringify(body), "utf8", "hex") + cipher.final("hex");

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
		.catch((e) => {
			null;
		});

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
	lines = lines.filter((line) => line.trim() !== "");
	lines = lines.filter((line) => {
		if (
			(line.slice(4, 6) === "00" || line.slice(4, 6) === "01") &&
			line.slice(7, 9) === "00"
		)
			return false;
		return true;
	});
	const synced_lines = lines.filter((line) =>
		/^\[\d{2}:\d{2}\.\d{2,3}\]/.test(line),
	);

	if (!lines.length) return null;

	const proto = await getProto("lyrics");
	const RootMessage = proto.lookupType("Root");

	const lyrics_obj = {
		lyrics: {
			syncType: synced_lines.length ? 1 : undefined,
			lines: synced_lines.length
				? synced_lines.map((line) => ({
						startTimeMs:
							Number.parseInt(line.slice(1, 3)) * 60 * 1000 +
							Number.parseInt(line.slice(4, 6)) * 1000 +
							Number.parseInt(line.split("]")[0].split(".")[1]),
						words: line.split("]").slice(1).join(""),
						syllabes: [],
						endTimeMs: 0,
					}))
				: lines.map((line) => ({
						startTimeMs: 0,
						words: line,
						syllabes: [],
						endTimeMs: 0,
					})),
			provider: "netease",
			providerLyricsId: `${id}`,
			providerDisplayName: "NetEase Cloud Music",
			language: langDetector.detect(lines.join("\n"))[0][0],
		},
		colors: {
			background: -9079435,
			text: -16777216,
			highlightText: -1,
		},
	};

	const errMsg = RootMessage.verify(lyrics_obj);
	if (errMsg) return null;

	const message = RootMessage.create(lyrics_obj);
	const buffer = RootMessage.encode(message).finish();

	return buffer;
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

	const proto = await getProto("lyrics");
	const RootMessage = proto.lookupType("Root");

	const lyrics_obj = {
		lyrics: {
			syncType: synced_lines ? 1 : undefined,
			lines: synced_lines
				? synced_lines.map((line) => ({
						startTimeMs:
							Number.parseInt(line.slice(1, 3)) * 60 * 1000 +
							Number.parseInt(line.slice(4, 6)) * 1000 +
							Number.parseInt(line.split("]")[0].split(".")[1]),
						words: line.split("]").slice(1).join(""),
						syllabes: [],
						endTimeMs: 0,
					}))
				: lines.split("\n").map((line) => ({
						startTimeMs: 0,
						words: line,
						syllabes: [],
						endTimeMs: 0,
					})),
			provider: "lrclib",
			providerLyricsId: `${lyrics.id}`,
			providerDisplayName: "LRCLIB",
		},
		colors: {
			background: -9079435,
			text: -16777216,
			highlightText: -1,
		},
	};

	const errMsg = RootMessage.verify(lyrics_obj);
	if (errMsg) return null;

	const message = RootMessage.create(lyrics_obj);
	const buffer = RootMessage.encode(message).finish();

	return buffer;
}

async function fetchLyrics(track_id: string, market: string) {
	const lyricsFetchers = [
		() => getSpotifyLyrics(track_id, market),
		() => getNeteaseLyrics(track_id),
		() => getLRCLibLyrics(track_id),
	];

	for (const fetcher of lyricsFetchers) {
		const buffer = await fetcher();
		if (buffer) return buffer;
	}

	return null;
}

async function noLyrics() {
	const proto = await getProto("lyrics");
	const RootMessage = proto.lookupType("Root");

	const lyrics_obj = {
		lyrics: {
			syncType: 0,
			lines: [],
			provider: "",
			providerLyricsId: "",
			providerDisplayName: "",
		},
		colors: {
			background: -9079435,
			text: -16777216,
			highlightText: -1,
		},
	};

	const errMsg = RootMessage.verify(lyrics_obj);
	if (errMsg) return null;

	const message = RootMessage.create(lyrics_obj);
	const buffer = RootMessage.encode(message).finish();

	return buffer;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (!req.url) return res.status(400).end();

	const track_id = req.url.split("/").pop()?.split("?")[0] as string;

	let market = "US";
	if (req.query.market === "from_token") {
		market = req.headers["x-vercel-ip-country"] as string;
	} else if (typeof req.query.market === "string") {
		market = req.query.market as string;
	}

	const lyrics_buffer = await fetchLyrics(track_id, market);
	if (!lyrics_buffer) return res.status(404).end();

	res.setHeader("Content-Type", "application/protobuf");
	res.status(200).send(lyrics_buffer);
}
