type HandlerContext = {
	request: {
		ip: string;
		query: ParsedUrlQuery | VercelRequestQuery;
		headers: IncomingHttpHeaders;
		body: Koa.Context["request"]["body"] | VercelRequestBody;
		method?: string;
	} & (Koa.Request | VercelRequest);
	params?: Record<string, string>;
	path: string;
};

type HandlerResponse = {
	status: number;
	headers: Record<string, string> | Headers;
	body: string | Uint8Array | ArrayBuffer | undefined;
};
