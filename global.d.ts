type HandlerContext = {
	request: {
		ip: string;
		query: ParsedUrlQuery | VercelRequestQuery;
		headers: IncomingHttpHeaders;
		method?: string;
	} & (Koa.Request | VercelRequest);
	params?: Record<string, string>;
	path: string;
};

type HandlerResponse = {
	status: number;
	headers: Record<string, string>;
	body: string | Uint8Array | ArrayBuffer;
};
