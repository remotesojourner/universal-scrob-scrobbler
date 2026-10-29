import { RequestDetails } from '@common/Requests';

export interface RequestErrorOptions {
	request?: RequestDetails;
	status?: number;
	text?: string;
	isCanceled?: boolean;
	extra?: Record<string, unknown>;
}

export class RequestError extends Error {
	request?: RequestDetails;
	status?: number;
	text?: string;
	isCanceled?: boolean;
	extra?: Record<string, unknown>;

	constructor(options: RequestErrorOptions) {
		const redactHeaders = (headers?: Record<string, string>) =>
			headers &&
			Object.fromEntries(
				Object.entries(headers).map(([name, value]) => [
					name,
					/^(x-api-key|authorization|proxy-authorization|cookie|uts-cookie)$/i.test(name)
						? '[REDACTED]'
						: value,
				])
			);
		const request = options.request && {
			...options.request,
			headers: redactHeaders(options.request.headers),
			withHeaders: redactHeaders(options.request.withHeaders),
		};
		super(JSON.stringify({ ...options, request }));

		this.request = request;
		this.status = options.status;
		this.text = options.text;
		this.isCanceled = options.isCanceled;
		this.extra = options.extra;
	}
}
