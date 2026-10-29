import { getScrobApiUrl, ScrobApi } from '@apis/ScrobApi';
import { Messaging } from '@common/Messaging';
import { RequestError } from '@common/RequestError';
import { Shared } from '@common/Shared';

export type ScrobAuthDetails = {
	instanceUrl: string;
	apiKey: string;
};

class _ScrobAuth extends ScrobApi {
	async validateConnection(
		instanceUrl?: string,
		apiKey?: string
	): Promise<ScrobAuthDetails | null> {
		if (Shared.pageType !== 'background') {
			return Messaging.toExtension({ action: 'validate-scrob-connection' });
		}
		let url = instanceUrl;
		let key = apiKey;
		if (!url || !key) {
			const values = await Shared.storage.get('auth');
			if (!values.auth?.instanceUrl || !values.auth?.apiKey) {
				return null;
			}
			return values.auth;
		}

		const baseUrl = url.replace(/\/+$/, '');
		const apiUrl = getScrobApiUrl(baseUrl);
		try {
			// Check reachability and API key validity together. Anonymous auth routes
			// may redirect to the web login even when API key authentication works.
			await this.requests.send({
				url: `${apiUrl}/media/search?q=test&type=movie`,
				method: 'GET',
				headers: {
					'X-Api-Key': key,
				},
			});

			const authDetails: ScrobAuthDetails = {
				instanceUrl: baseUrl,
				apiKey: key,
			};
			await Shared.storage.set({ auth: authDetails }, true);
			return authDetails;
		} catch (err) {
			if (
				err instanceof RequestError &&
				(err.status === 401 || err.status === 403 || err.status === 302)
			) {
				await Shared.storage.remove('auth', true);
			}
			return null;
		}
	}

	async connect(instanceUrl: string, apiKey: string): Promise<ScrobAuthDetails> {
		const auth = await this.validateConnection(instanceUrl, apiKey);
		if (!auth) {
			throw new Error('Invalid Scrob instance URL or API key.');
		}
		return auth;
	}

	async disconnect(): Promise<void> {
		await Shared.storage.remove('auth', true);
	}
}

export const ScrobAuth = new _ScrobAuth();
