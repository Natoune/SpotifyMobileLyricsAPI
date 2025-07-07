import { createError, defineEventHandler, setHeader } from "h3";
import { fetchLyrics } from "../fetchers";

export default {
	get: defineEventHandler(async (event) => {
		const track_id = event.context.params?.id;
		if (!track_id) throw createError({ status: 400 });

		const path_match = event.path.match(/\/image\/(.+)$/);
		const image_url = path_match ? decodeURIComponent(path_match[1]) : null;

		const lyrics_buffer = await fetchLyrics(
			track_id,
			event.context.cloudflare?.env || process.env,
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
