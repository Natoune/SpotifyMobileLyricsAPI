import CryptoJS from "crypto-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import querystring from "node:querystring";
import { Database } from "./database";
import { TOTP } from "./totp";

export let spotifyToken: {
	accessToken: string;
	accessTokenExpirationTimestampMs: number;
	[key: string]: any;
};

export const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.3";

export async function storeSpotifyToken(
	database: Database,
	token: {
		accessToken: string;
		accessTokenExpirationTimestampMs: number;
	}
): Promise<void> {
	// Set token in memory
	spotifyToken = token;

	// Store token in filesystem
	try {
		writeFileSync(
			join(__dirname, "..", "token"),
			Buffer.from(JSON.stringify(spotifyToken), "utf-8").toString("hex")
		);
	} catch {}

	// Store token in database
	if (database.enabled) {
		try {
			await database.query(
				`UPDATE variables SET value = '${btoa(
					JSON.stringify({
						accessToken: spotifyToken.accessToken,
						accessTokenExpirationTimestampMs:
							spotifyToken.accessTokenExpirationTimestampMs,
					})
				)}' WHERE name = 'sp_access_token'`,
				true
			);
		} catch {}
	}
}

export async function getSpotifyToken(
	env: Record<string, string>,
	database: Database
): Promise<string | null> {
	// Get token from memory
	if (
		spotifyToken?.accessToken &&
		spotifyToken?.accessTokenExpirationTimestampMs > Date.now()
	)
		return spotifyToken.accessToken;

	// Get token from filesystem
	try {
		if (existsSync(join(__dirname, "..", "token"))) {
			const token = JSON.parse(
				Buffer.from(
					readFileSync(join(__dirname, "..", "token"), "utf-8"),
					"hex"
				).toString()
			);

			if (token) {
				spotifyToken = token;
				if (
					spotifyToken.accessToken &&
					spotifyToken.accessTokenExpirationTimestampMs > Date.now()
				)
					return spotifyToken.accessToken;
			}
		}
	} catch {}

	// Get token from database
	if (database.enabled) {
		try {
			const token = await database.query<{
				value: string;
			}>("SELECT value FROM variables WHERE name = 'sp_access_token'");

			if (token?.value) {
				spotifyToken = JSON.parse(atob(token.value));
				if (
					spotifyToken.accessToken &&
					spotifyToken.accessTokenExpirationTimestampMs > Date.now()
				)
					return spotifyToken.accessToken;
			}
		} catch {}
	}

	// Get token from API
	const SP_DC =
		env.SP_DC.split(",")[
			Math.floor(Math.random() * env.SP_DC.split(",").length)
		];

	const serverTime = await fetch("https://open.spotify.com/api/server-time", {
		headers: {
			"User-Agent": USER_AGENT,
			Cookie: `sp_dc=${SP_DC}`,
		},
	})
		.then((res) => res.json())
		.then((data) => data.serverTime * 1000)
		.catch(() => 0);

	const totp = new TOTP();
	const token = await fetch(
		`https://open.spotify.com/api/token?reason=init&productType=web-player&totp=${totp.generate(
			serverTime
		)}&totpVer=${totp.version}&ts=${serverTime}`,
		{
			headers: {
				"User-Agent": USER_AGENT,
				Cookie: `sp_dc=${SP_DC}`,
			},
		}
	)
		.then((res) => res.json())
		.catch(() => null);

	if (!token?.accessToken) return null;

	await storeSpotifyToken(database, {
		accessToken: token.accessToken,
		accessTokenExpirationTimestampMs:
			token.accessTokenExpirationTimestampMs,
	});
	return token.accessToken;
}

export async function getTrackInfo(
	env: Record<string, string>,
	database: Database,
	track_id: string
) {
	const trackInfo = await fetch(
		`https://api.spotify.com/v1/tracks/${track_id}`,
		{
			headers: {
				Authorization: `Bearer ${await getSpotifyToken(env, database)}`,
			},
		}
	)
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
		}
	).toString();

	const form = querystring.stringify({
		eparams: hex.toUpperCase(),
	});

	return await fetch("http://music.163.com/api/linux/forward", {
		method: body.method,
		headers: {
			referer: "https://music.163.com/",
			cookie: "os=pc; osver=Microsoft-Windows-10-Professional-build-10586-64bit; appver=2.0.3.131777; channel=netease; __remember_me=true",
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
