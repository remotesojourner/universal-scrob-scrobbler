import { ScrobAuthDetails } from '@apis/ScrobAuth';
import { CacheStorageValues } from '@common/Cache';
import { I18N } from '@common/I18N';
import { Messaging } from '@common/Messaging';
import { Session } from '@common/Session';
import { Shared } from '@common/Shared';
import { Utils } from '@common/Utils';
import { ScrobbleItemValues } from '@models/Item';
import { getService, getServices } from '@models/Service';
import '@services';
import { PartialDeep } from 'type-fest';
import browser, { Manifest as WebExtManifest } from 'webextension-polyfill';

export type KinoPubAuthDetails = {
	access_token: string;
	token_type: string;
	expires_in: number;
	refresh_token: string;
	created_at: number;
};

export type ServiceValue = {
	scrobble: boolean;
	sync: boolean;
	autoSync: boolean;
	autoSyncDays: number;
	lastSync: number;
	lastSyncId: string;
};

export type ThemeValue = 'light' | 'dark' | 'system';

export type StorageValuesOptions = {
	services: Record<string, ServiceValue>;
	showNotifications: boolean;
	loadImages: boolean;
	theme: ThemeValue;
	grantCookies: boolean;
};

export type StorageValuesSyncOptions = {
	hideSynced: boolean;
	addWithReleaseDate: boolean;
	addWithReleaseDateMissing: boolean;
	minPercentageWatched: number;
};

export interface ScrobblingDetails {
	item: ScrobbleItemValues;
	tabId: number | null;
	isPaused: boolean;
}

export type SyncCacheValue = {
	items: ScrobbleItemValues[];
	failed: boolean;
};

export type CorrectItem = {
	type: 'episode' | 'movie';
	scrobId?: number;
	url: string;
};

export type StorageValues = {
	version?: number;
	auth?: ScrobAuthDetails;
	options?: StorageValuesOptions;
	syncOptions?: StorageValuesSyncOptions;
	scrobblingDetails?: ScrobblingDetails;
	syncCache?: SyncCacheValue;
	kinoPubAuth?: KinoPubAuthDetails;
	autoSyncCache?: Record<string, SyncCacheValue>;
} & CacheStorageValues;

export type OptionsDetails = {
	[K in keyof StorageValuesOptions]: OptionDetails<StorageValuesOptions, K>;
};

export type SyncOptionsDetails = {
	[K in keyof StorageValuesSyncOptions]: OptionDetails<StorageValuesSyncOptions, K>;
};

export type OptionDetails<T, K extends keyof T = keyof T> =
	| SelectOptionDetails<T, K>
	| SwitchOptionDetails<T, K>
	| TextFieldOptionDetails<T, K>
	| NumericTextFieldOptionDetails<T, K>
	| CustomOptionDetails<T, K>;

export type OptionDetailsByType<
	T,
	U extends OptionDetails<T>['type'],
	K extends keyof T = keyof T,
> = Extract<OptionDetails<T, K>, { type: U }>;

export interface BaseOptionDetails<T, K extends keyof T> {
	type: 'select' | 'switch' | 'text' | 'number' | 'custom';
	id: K;
	value: T[K];
	dependencies?: (keyof T)[];
	permissions?: WebExtManifest.OptionalPermission[];
	origins?: string[];
	doShow: boolean;
}

export interface SelectOptionDetails<T, K extends keyof T> extends BaseOptionDetails<T, K> {
	type: 'select';
	choices: Record<string, string>;
}

export interface SwitchOptionDetails<T, K extends keyof T> extends BaseOptionDetails<T, K> {
	type: 'switch';
}

export interface TextFieldOptionDetails<T, K extends keyof T> extends BaseOptionDetails<T, K> {
	type: 'text';
}

export interface NumericTextFieldOptionDetails<T, K extends keyof T>
	extends BaseOptionDetails<T, K> {
	type: 'number';
	minValue?: number;
	maxValue?: number;
	step?: number;
}

export interface CustomOptionDetails<T, K extends keyof T> extends BaseOptionDetails<T, K> {
	type: 'custom';
}

export type BrowserStorageSetValues = Omit<StorageValues, 'options' | 'syncOptions'>;

export type BrowserStorageRemoveKey = Exclude<keyof StorageValues, 'options' | 'syncOptions'>;

class _BrowserStorage {
	readonly currentVersion = 1;

	isSyncAvailable: boolean;
	options = {} as StorageValuesOptions;
	optionsDetails = {} as OptionsDetails;
	syncOptions = {} as StorageValuesSyncOptions;
	syncOptionsDetails = {} as SyncOptionsDetails;

	constructor() {
		this.isSyncAvailable = !!browser.storage.sync;
	}

	async init() {
		if (Shared.pageType !== 'background') {
			Shared.tabId = await Messaging.toExtension({ action: 'get-tab-id' });
		}
		await this.sync();
		await this.loadOptions();
		await this.loadSyncOptions();
		await Session.checkLogin();
	}

	async sync(): Promise<void> {
		if (this.isSyncAvailable) {
			let values = (await browser.storage.sync.get()) as StorageValues;
			values = this.joinChunks(values);
			for (const key of Object.keys(values) as (keyof StorageValues)[]) {
				await browser.storage.local.set({ [key]: values[key] });
			}
		}
	}

	async set(values: BrowserStorageSetValues, doSync: boolean): Promise<void> {
		return this.doSet(values, doSync);
	}

	private async doSet(values: StorageValues, doSync: boolean): Promise<void> {
		if (doSync && this.isSyncAvailable) {
			try {
				const syncValues = await this.splitChunks(values);
				await browser.storage.sync.set(syncValues);
			} catch (err) {
				console.warn('[UTS] Failed to save to storage.sync, using local storage:', err);
			}
		}
		await browser.storage.local.set(values);
	}

	get(keys?: keyof StorageValues | (keyof StorageValues)[] | null): Promise<StorageValues> {
		return browser.storage.local.get(
			(keys ?? undefined) as string | string[] | undefined
		) as Promise<StorageValues>;
	}

	async remove(
		keys: BrowserStorageRemoveKey | BrowserStorageRemoveKey[],
		doSync = false
	): Promise<void> {
		return this.doRemove(keys, doSync);
	}

	private async doRemove(
		keys: keyof StorageValues | (keyof StorageValues)[],
		doSync = false
	): Promise<void> {
		const keyList = (Array.isArray(keys) ? keys : [keys]) as string[];
		if (doSync && this.isSyncAvailable) {
			try {
				const syncKeys: string[] = [];
				for (const key of keyList) {
					syncKeys.push(key);

					const numChunks = await this.getNumChunks(key);
					if (numChunks > 0) {
						syncKeys.push(...this.getChunkKeys(key, numChunks));
					}
				}
				await browser.storage.sync.remove(syncKeys);
			} catch (err) {
				console.warn('[UTS] Failed to remove from storage.sync:', err);
			}
		}
		await browser.storage.local.remove(keyList);
	}

	async clear(doSync: boolean): Promise<void> {
		if (doSync && this.isSyncAvailable) {
			await browser.storage.sync.clear();
		}
		await browser.storage.local.clear();
		await this.set({ version: this.currentVersion }, true);
		await this.reset();
		void Shared.events.dispatch('STORAGE_OPTIONS_CHANGE', null, {
			options: this.options,
			syncOptions: this.syncOptions,
		});
		void Shared.events.dispatch('STORAGE_OPTIONS_CLEAR', null, {});
	}

	async reset() {
		this.options = {} as StorageValuesOptions;
		this.syncOptions = {} as StorageValuesSyncOptions;
		await this.loadOptions();
		await this.loadSyncOptions();
	}

	/**
	 * Splits values in chunks, so that each chunk is smaller than QUOTA_BYTES_PER_ITEM
	 * and therefore can be saved in the sync storage.
	 */
	private async splitChunks(values: Record<string, unknown>): Promise<StorageValues> {
		const maxSize = browser.storage.sync.QUOTA_BYTES_PER_ITEM ?? 8192;
		const newValues: Record<string, unknown> = {};
		const keysToRemove: string[] = [];

		for (const [key, value] of Object.entries(values)) {
			let stringifiedValue = JSON.stringify(value);
			const size = `${key}${stringifiedValue}`.length + 10;
			const numChunks = await this.getNumChunks(key);

			if (size < maxSize && numChunks === 0) {
				newValues[key] = value;
				continue;
			}

			keysToRemove.push(key);

			const chunks = [];
			const sliceEnd = maxSize - key.length - 10;

			while (stringifiedValue.length > 0) {
				chunks.push(stringifiedValue.slice(0, sliceEnd));
				stringifiedValue = stringifiedValue.slice(sliceEnd);
			}

			if (chunks.length > 1) {
				for (const [i, chunk] of chunks.entries()) {
					const chunkKey = this.getChunkKey(key, i);
					newValues[chunkKey] = chunk;
				}

				const chunksKey = this.getChunksKey(key);
				newValues[chunksKey] = chunks.length;
			} else {
				newValues[key] = JSON.parse(chunks[0]);
			}
		}

		if (keysToRemove.length > 0) {
			await this.remove(keysToRemove as BrowserStorageRemoveKey[], true);
		}

		return newValues;
	}

	private joinChunks(values: Record<string, unknown>): StorageValues {
		const newValues: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(values)) {
			if (!key.includes('_chunk')) {
				newValues[key] = value;
				continue;
			}

			if (!key.endsWith('_chunks')) {
				continue;
			}

			const numChunks = value as number;
			const actualKey = key.split('_chunks')[0];
			let stringifiedValue = '';

			for (let i = 0; i < numChunks; i++) {
				const chunkKey = this.getChunkKey(actualKey, i);
				stringifiedValue += values[chunkKey] as string;
			}

			newValues[actualKey] = JSON.parse(stringifiedValue);
		}

		return newValues;
	}

	private async getNumChunks(key: string): Promise<number> {
		const chunksKey = this.getChunksKey(key);
		const values = await browser.storage.local.get(chunksKey);
		return (values[chunksKey] as number) || 0;
	}

	private getChunksKey(key: string): string {
		return `${key}_chunks`;
	}

	private getChunkKeys(key: string, numChunks: number): string[] {
		return [
			this.getChunksKey(key),
			...new Array(numChunks).fill('').map((_, i) => this.getChunkKey(key, i)),
		];
	}

	private getChunkKey(key: string, i: number): string {
		return `${key}_chunk${i.toString().padStart(3, '0')}`;
	}

	async getSize(keys?: keyof StorageValues | (keyof StorageValues)[] | null): Promise<string> {
		let size = '';
		const values = await this.get(keys);
		let bytes = (JSON.stringify(values) || '').length;
		if (bytes < 1024) {
			size = `${bytes.toFixed(2)} B`;
		} else {
			bytes /= 1024;
			if (bytes < 1024) {
				size = `${bytes.toFixed(2)} KB`;
			} else {
				bytes /= 1024;
				size = `${bytes.toFixed(2)} MB`;
			}
		}
		return size;
	}

	async loadOptions(): Promise<void> {
		this.optionsDetails = {
			services: {
				type: 'custom',
				id: 'services',
				value: Object.fromEntries(
					getServices().map((service) => [
						service.id,
						{
							scrobble: false,
							sync: false,
							autoSync: false,
							autoSyncDays: 7,
							lastSync: 0,
							lastSyncId: '',
						},
					])
				),
				doShow: true,
			},
			showNotifications: {
				type: 'switch',
				id: 'showNotifications',
				value: false,
				permissions: ['notifications'],
				doShow: !!browser.notifications,
			},
			loadImages: {
				type: 'switch',
				id: 'loadImages',
				value: true,
				doShow: true,
			},
			theme: {
				type: 'select',
				id: 'theme',
				value: 'system',
				choices: {
					light: I18N.translate('lightTheme'),
					dark: I18N.translate('darkTheme'),
					system: I18N.translate('systemTheme'),
				},
				doShow: true,
			},
			grantCookies: {
				type: 'switch',
				id: 'grantCookies',
				value: false,
				permissions: ['cookies', 'webRequest', 'webRequestBlocking'],
				doShow: Shared.browser === 'firefox',
			},
		};
		const values = await this.get('options');
		if (values.options) {
			this.options = values.options;
		}
		for (const option of Object.values(this.optionsDetails)) {
			option.value =
				typeof this.options[option.id] !== 'undefined' ? this.options[option.id] : option.value;
			if (this.isOption(option, 'services', 'custom')) {
				const missingServices = Object.fromEntries(
					getServices()
						.filter((service) => !(service.id in option.value))
						.map((service) => [
							service.id,
							{
								scrobble: false,
								sync: false,
								autoSync: false,
								autoSyncDays: 7,
								lastSync: 0,
								lastSyncId: '',
							},
						])
				);
				option.value = Utils.mergeObjs(option.value, missingServices);
			}
			this.options[option.id] = option.value as never;
		}
	}

	private async requestPermissionsSafely(req: {
		permissions?: WebExtManifest.OptionalPermission[];
		origins?: string[];
	}): Promise<boolean> {
		try {
			if (!req.permissions?.length && !req.origins?.length) {
				return true;
			}
			const hasPermission = await browser.permissions.contains(req);
			if (hasPermission) {
				return true;
			}
			return await browser.permissions.request(req);
		} catch (_err) {
			return true;
		}
	}

	private async removePermissionsSafely(req: {
		permissions?: WebExtManifest.OptionalPermission[];
		origins?: string[];
	}): Promise<boolean> {
		try {
			if (!req.permissions?.length && !req.origins?.length) {
				return true;
			}
			return await browser.permissions.remove(req);
		} catch (_err) {
			return true;
		}
	}

	saveOptions(partialOptions: PartialDeep<StorageValuesOptions>) {
		const options = Utils.mergeObjs(this.options, partialOptions);
		const permissionPromises: Promise<boolean>[] = [];

		for (const [id, value] of Object.entries(partialOptions) as [
			keyof StorageValuesOptions,
			PartialDeep<StorageValuesOptions>[keyof StorageValuesOptions],
		][]) {
			if (!value) {
				continue;
			}

			const optionDetails = this.optionsDetails[id];
			if (optionDetails.permissions || optionDetails.origins) {
				if (value) {
					permissionPromises.push(
						this.requestPermissionsSafely({
							permissions: optionDetails.permissions || [],
							origins: optionDetails.origins || [],
						})
					);
				} else {
					permissionPromises.push(
						this.removePermissionsSafely({
							permissions: optionDetails.permissions || [],
							origins: optionDetails.origins || [],
						})
					);
				}
			}
		}

		if (partialOptions.services) {
			const originsToAdd = [];
			const originsToRemove = [];

			for (const [id, partialValue] of Object.entries(partialOptions.services)) {
				if (!partialValue || (!('scrobble' in partialValue) && !('sync' in partialValue))) {
					continue;
				}

				const value = options.services[id];
				const service = getService(id);
				if (partialValue.scrobble || partialValue.sync) {
					originsToAdd.push(...service.hostPatterns);
				} else if (!value.scrobble && !value.sync) {
					originsToRemove.push(...service.hostPatterns);
				}
			}

			if (originsToAdd.length > 0 || originsToRemove.length > 0) {
				const scrobblerEnabled = getServices().some(
					(service) => service.hasScrobbler && options.services[service.id].scrobble
				);
				if (originsToAdd.length > 0) {
					let permissionsToAdd: WebExtManifest.OptionalPermission[] = [];
					if (Shared.browser == 'firefox') {
						permissionsToAdd = scrobblerEnabled ? ['tabs'] : [];
					}
					permissionPromises.push(
						this.requestPermissionsSafely({
							permissions: permissionsToAdd,
							origins: originsToAdd,
						})
					);
				}
				if (originsToRemove.length > 0) {
					let permissionsToRemove: WebExtManifest.OptionalPermission[] = [];
					if (Shared.browser == 'firefox') {
						permissionsToRemove = scrobblerEnabled ? [] : ['tabs'];
					}
					permissionPromises.push(
						this.removePermissionsSafely({
							permissions: permissionsToRemove,
							origins: originsToRemove,
						})
					);
				}
			}
		}

		if (permissionPromises.length === 0) {
			permissionPromises.push(Promise.resolve(true));
		}

		return Promise.all(permissionPromises).then(async (isSuccessArr) => {
			if (isSuccessArr.every((isSuccess) => isSuccess)) {
				await this.doSet({ options }, true);
				this.updateOptions(partialOptions);
				void Shared.events.dispatch('STORAGE_OPTIONS_CHANGE', null, {
					options: partialOptions,
				});
			} else {
				throw new Error('Permissions not granted');
			}
		});
	}

	updateOptions(options: PartialDeep<StorageValuesOptions>) {
		this.options = Utils.mergeObjs(this.options, options);
		this.optionsDetails = Utils.mergeObjs(
			this.optionsDetails,
			Object.fromEntries(Object.entries(this.options).map(([id, value]) => [id, { value }]))
		);
	}

	isOption<T, U extends OptionDetails<T, K>['type'], K extends keyof T>(
		option: OptionDetails<T>,
		id: K | null,
		type: U | null = null
	): option is OptionDetailsByType<T, U, K> {
		return (!id || option.id === id) && (!type || option.type === type);
	}

	async loadSyncOptions(): Promise<void> {
		this.syncOptionsDetails = {
			hideSynced: {
				type: 'switch',
				id: 'hideSynced',
				value: false,
				doShow: true,
			},
			addWithReleaseDate: {
				type: 'switch',
				id: 'addWithReleaseDate',
				value: false,
				doShow: true,
			},
			addWithReleaseDateMissing: {
				type: 'switch',
				id: 'addWithReleaseDateMissing',
				value: false,
				dependencies: ['addWithReleaseDate'],
				doShow: true,
			},
			minPercentageWatched: {
				type: 'number',
				id: 'minPercentageWatched',
				value: 75,
				minValue: 0,
				maxValue: 100,
				doShow: true,
			},
		};
		const values = await this.get('syncOptions');
		if (values.syncOptions) {
			this.syncOptions = values.syncOptions;
		}
		for (const option of Object.values(this.syncOptionsDetails)) {
			option.value =
				typeof this.syncOptions[option.id] !== 'undefined'
					? this.syncOptions[option.id]
					: option.value;
			if (this.isOption(option, null, 'number')) {
				let val = option.value as number;
				if (typeof option.minValue !== 'undefined') {
					val = Math.max(val, option.minValue);
				}
				if (typeof option.maxValue !== 'undefined') {
					val = Math.min(val, option.maxValue);
				}
				option.value = val;
			}
			this.syncOptions[option.id] = option.value as never;
		}
	}

	async saveSyncOptions(partialOptions: Partial<StorageValuesSyncOptions>) {
		const syncOptions = Utils.mergeObjs(this.syncOptions, partialOptions);
		await this.doSet({ syncOptions }, true);
		this.updateSyncOptions(partialOptions);
		void Shared.events.dispatch('STORAGE_OPTIONS_CHANGE', null, {
			syncOptions: partialOptions,
		});
	}

	updateSyncOptions(options: PartialDeep<StorageValuesSyncOptions>) {
		this.syncOptions = Utils.mergeObjs(this.syncOptions, options);
		this.syncOptionsDetails = Utils.mergeObjs(
			this.syncOptionsDetails,
			Object.fromEntries(Object.entries(this.syncOptions).map(([id, value]) => [id, { value }]))
		);
	}

	checkDisabledOption(option: OptionDetails<StorageValuesOptions>) {
		const isDisabled =
			option.dependencies?.some((dependency) => !this.options[dependency]) ?? false;
		return isDisabled;
	}

	checkSyncOptionDisabled(option: OptionDetails<StorageValuesSyncOptions>) {
		const isDisabled =
			option.dependencies?.some((dependency) => !this.syncOptions[dependency]) ?? false;
		return isDisabled;
	}
}

export const BrowserStorage = new _BrowserStorage();

Shared.storage = BrowserStorage;
