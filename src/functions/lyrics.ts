import { createError, defineEventHandler, getQuery, setHeader } from "h3";
import { fetchLyrics } from "../fetchers";

export default {
	get: defineEventHandler(async (event) => {
		const track_id = event.context.params?.id;
		if (!track_id) throw createError({ status: 400 });

		const path_match = event.path.match(/\/track\/[^/]+\/image\/(.+)$/);
		const image_url = path_match ? decodeURIComponent(path_match[1]) : null;

		const query = getQuery(event);

		let market = "US";
		if (!query.market || query.market === "from_token") {
			market =
				event.headers.get("x-vercel-ip-country") ||
				event.headers.get("cf-ipcountry") ||
				"US";
		} else if (typeof query.market === "string") {
			market = query.market as string;
		}

		const lyrics_buffer = await fetchLyrics(
			track_id,
			market,
			event.context.cloudflare?.env || process.env,
			event.headers.get("authorization"),
			image_url
		);
		if (!lyrics_buffer) {
			setHeader(event, "Cache-Control", "no-store");
			throw createError({ status: 404 });
		}

		setHeader(event, "Content-Type", "application/protobuf");
		return lyrics_buffer;
	}),
};
