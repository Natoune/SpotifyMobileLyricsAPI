import * as protobuf from "@bufbuild/protobuf";
import LanguageDetect from "languagedetect";
import { RootSchema } from "./gen/lyrics_pb";
import {
	USER_AGENT,
	database,
	fetchNetease,
	getSpotifyToken,
	getTrackInfo,
	setSpotifyToken,
	useDatabase,
} from "./utils";

const langDetector = new LanguageDetect();
langDetector.setLanguageType("iso2");

let env: Record<string, any>;

async function getLyricsFromDB(track_id: string) {
	if (!useDatabase) return null;

	try {
		const lyrics = database!
			.prepare<
				string,
				{ s: number; l: string; b: number; t: number; h: number }
			>("SELECT * FROM l WHERE i = ? LIMIT 1")
			.get(track_id);

		if (!lyrics) return null;

		return {
			lyrics: {
				syncType: lyrics.s === 1 ? 1 : undefined,
				lines: lyrics.l.split("|").map((line: string) => {
					const [startTimeMs, words, existsSync] = line.split(".");
					return {
						startTimeMs: Number.parseInt(startTimeMs),
						words: Buffer.from(words, "base64").toString(),
						existsSync: existsSync === "true",
					};
				}),
				provider: "musixmatch",
				providerDisplayName: "Musixmatch",
			},
			colors: {
				background: lyrics.b,
				text: lyrics.t,
				highlightText: lyrics.h,
			},
		};
	} catch {
		return null;
	}
}

async function getSpotifyLyrics(
	id: string,
	market: string,
	image_url: string | null = null,
) {
	const url = image_url
		? `https://spclient.wg.spotify.com/color-lyrics/v2/track/${id}/image/${encodeURIComponent(image_url)}?format=json&vocalRemoval=false&market=${market}`
		: `https://spclient.wg.spotify.com/color-lyrics/v2/track/${id}?format=json&vocalRemoval=false&market=${market}`;

	const lyrics = await fetch(url, {
		headers: {
			"app-platform": "WebPlayer",
			"User-Agent": USER_AGENT,
			Authorization: `Bearer ${await getSpotifyToken(env)}`,
		},
	})
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

	if (useDatabase) {
		database!
			.prepare<[string, number, string, number, number, number], void>(
				"INSERT INTO l (i, s, l, b, t, h) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run(
				id,
				lyrics.lyrics.syncType ? 1 : 0,
				lyrics.lyrics.lines
					.map(
						(line) =>
							`${line.startTimeMs}.${Buffer.from(line.words).toString(
								"base64",
							)}.${line.endTimeMs || 0}`,
					)
					.join("|"),
				lyrics.colors.background,
				lyrics.colors.text,
				lyrics.colors.highlightText,
			);
	}

	return lyrics;
}

async function getNeteaseLyrics(track_id: string) {
	const { name, artist } = await getTrackInfo(env, track_id);
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
		if (!line.includes("]")) return false;
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
	const { name, artist, album, duration } = await getTrackInfo(env, track_id);
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
	authorization: string | null,
	image_url: string | null = null,
) {
	env = setEnv;

	if (authorization && authorization.split(" ").length > 1)
		setSpotifyToken({
			accessToken: authorization.split(" ")[1],
			accessTokenExpirationTimestampMs: Date.now() + 3600000,
		});

	const lyricsFetchers = [
		() => getLyricsFromDB(track_id),
		() => getSpotifyLyrics(track_id, market, image_url),
		() => getSpotifyLyrics(track_id, market, image_url),
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
