import { ScrobAuth } from '@apis/ScrobAuth';
import { Messaging } from '@common/Messaging';
import { Shared } from '@common/Shared';
import browser from 'webextension-polyfill';

class _Session {
	isLoggedIn: boolean;

	constructor() {
		this.isLoggedIn = false;
	}

	async checkLogin(): Promise<void> {
		try {
			const auth = await ScrobAuth.validateConnection();
			if (auth && auth.instanceUrl && auth.apiKey) {
				this.isLoggedIn = true;
				await Shared.events.dispatch('LOGIN_SUCCESS', null, { auth });
			} else {
				throw new Error('Not connected to Scrob');
			}
		} catch (err) {
			this.isLoggedIn = false;
			if (Shared.errors.validate(err)) {
				await Shared.events.dispatch('LOGIN_ERROR', null, { error: err });
			}
		}
	}

	async login(instanceUrl: string, apiKey: string): Promise<void> {
		try {
			const url = new URL(instanceUrl);
			if (url.protocol !== 'http:' && url.protocol !== 'https:') {
				throw new Error('Scrob instance URL must use HTTP or HTTPS.');
			}
			// Request directly from the Connect gesture, before background messaging.
			// Host permission patterns apply to all ports on the selected hostname.
			const granted = await browser.permissions.request({
				origins: [`${url.protocol}//${url.hostname}/*`],
			});
			if (!granted) {
				throw new Error('Permission to access the Scrob instance was not granted.');
			}
			const auth = await Messaging.toExtension({ action: 'login', instanceUrl, apiKey });
			if (auth && auth.instanceUrl && auth.apiKey) {
				this.isLoggedIn = true;
				await Shared.events.dispatch('LOGIN_SUCCESS', null, { auth });
			} else {
				throw new Error('Invalid Scrob connection');
			}
		} catch (err) {
			this.isLoggedIn = false;
			if (Shared.errors.validate(err)) {
				Shared.errors.error('Failed to connect to Scrob.', err);
				await Shared.events.dispatch('LOGIN_ERROR', null, { error: err });
			}
		}
	}

	async logout(): Promise<void> {
		try {
			await Messaging.toExtension({ action: 'logout' });
			this.isLoggedIn = false;
			await Shared.events.dispatch('LOGOUT_SUCCESS', null, {});
		} catch (err) {
			this.isLoggedIn = true;
			if (Shared.errors.validate(err)) {
				Shared.errors.error('Failed to disconnect from Scrob.', err);
				await Shared.events.dispatch('LOGOUT_ERROR', null, { error: err });
			}
		}
	}
}

export const Session = new _Session();
