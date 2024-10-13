import { createApp, createRouter } from "h3";
import { useCompressionStream } from "h3-compression";
import lyrics from "./functions/lyrics";
import proxy from "./functions/proxy";

export const app = createApp({ onBeforeResponse: useCompressionStream });

const router = createRouter();
app.use(router);

router.get("/**", proxy.get);
router.post("/**", proxy.post);

router.get("/color-lyrics/v2/track/:id", lyrics.get);
