import { createClient } from "redis";
let redisClient: ReturnType<typeof createClient>;

export async function getSpotifyToken() {
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
