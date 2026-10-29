import { ScrobApi } from '@apis/ScrobApi';
import { Cache, CacheItem } from '@common/Cache';
import { RequestError } from '@common/RequestError';
import { Shared } from '@common/Shared';
import { Utils } from '@common/Utils';
import { ScrobbleItem } from '@models/Item';
import { SyncStore } from '@stores/SyncStore';

export interface ScrobHistoryItemEvent {
	id: number;
	tmdb_id: number;
	media_type: string;
	watched_at: string;
	completed: boolean;
}

export interface WatchEventCreate {
	tmdb_id?: number | null;
	tvdb_id?: number | null;
	media_type: 'movie' | 'episode';
	watched_at?: string | null;
	completed?: boolean;
	series_tmdb_id?: number | null;
	series_tvdb_id?: number | null;
	season_number?: number | null;
	episode_number?: number | null;
}

class _ScrobSync extends ScrobApi {
	private isDuplicateWatch(error: unknown): boolean {
		if (!(error instanceof RequestError) || error.status !== 409 || error.isCanceled) {
			return false;
		}
		try {
			return JSON.parse(error.text || '')?.detail?.error === 'duplicate_watch';
		} catch {
			return false;
		}
	}

	async loadHistory(
		item: ScrobbleItem,
		scrobHistoryItemsCache: CacheItem<'scrobHistoryItems'>,
		forceRefresh = false,
		cancelKey = 'default'
	): Promise<void> {
		const _watchedAt = item.scrob?.watchedAt || item.getWatchedDate();
		if (!item.scrob) {
			return;
		}
		const databaseId = item.scrob.getDatabaseId();
		let historyEvents = forceRefresh ? null : scrobHistoryItemsCache.get(databaseId);
		if (!historyEvents) {
			await this.activate();
			try {
				const responseText = await this.requests.send({
					url: `${this.API_URL}/history/item-events?tmdb_id=${item.scrob.tmdbId.toString()}&media_type=${
						item.scrob.type
					}`,
					method: 'GET',
					cancelKey,
				});
				const response = JSON.parse(responseText) as { events?: ScrobHistoryItemEvent[] };
				historyEvents = response.events || [];
				scrobHistoryItemsCache.set(databaseId, historyEvents);
			} catch (_) {
				historyEvents = [];
			}
		}

		if (historyEvents && historyEvents.length > 0) {
			const latestEvent = historyEvents[0];
			item.scrob.syncId = latestEvent.id;
			item.scrob.watchedAt = Utils.unix(latestEvent.watched_at);
			item.scrob.otherWatches = historyEvents.slice(1).map((e) => Utils.unix(e.watched_at));
		} else {
			item.scrob.watchedAt = null;
		}
	}

	async removeHistory(item: ScrobbleItem): Promise<void> {
		if (!item.scrob) {
			return;
		}
		await this.activate();
		if (item.scrob.syncId) {
			await this.requests.send({
				url: `${this.API_URL}/history/event/${item.scrob.syncId.toString()}`,
				method: 'DELETE',
			});
		} else {
			await this.requests.send({
				url: `${this.API_URL}/history/item?tmdb_id=${item.scrob.tmdbId.toString()}&media_type=${
					item.scrob.type
				}`,
				method: 'DELETE',
			});
		}
		item.scrob.syncId = undefined;
		item.scrob.watchedAt = undefined;
	}

	async sync(store: SyncStore, items: ScrobbleItem[], cancelKey = 'sync'): Promise<void> {
		const newItems: ScrobbleItem[] = [];
		let addedCount = 0;
		try {
			await this.activate();
			const scrobHistoryItemsCache = await Cache.get('scrobHistoryItems');
			for (const item of items) {
				if (!item.scrob) {
					continue;
				}
				const payload: WatchEventCreate = {
					tmdb_id: item.scrob.tmdbId || 0,
					media_type: item.scrob.type as 'movie' | 'episode',
					watched_at: Utils.convertToISOString(item.getWatchedDate()),
					completed: true,
				};
				if (item.scrob.tvdbId && item.scrob.tvdbId > 0) {
					payload.tvdb_id = item.scrob.tvdbId;
				}

				if (item.scrob.type === 'episode') {
					payload.tmdb_id = item.scrob.tmdbId || item.scrob.show.tmdbId || 0;
					payload.series_tmdb_id = item.scrob.show.tmdbId || item.scrob.show.tvdbId || 0;
					if (item.scrob.show.tvdbId && item.scrob.show.tvdbId > 0) {
						payload.series_tvdb_id = item.scrob.show.tvdbId;
					}
					payload.season_number = item.scrob.season;
					payload.episode_number = item.scrob.number;
				}

				try {
					await this.requests.send({
						url: `${this.API_URL}/history`,
						method: 'POST',
						body: payload,
						cancelKey,
					});
					addedCount++;
				} catch (error) {
					// Already recorded watches must not stop the remaining import.
					if (!this.isDuplicateWatch(error)) {
						throw error;
					}
				}

				const newItem = item.clone();
				await this.loadHistory(newItem, scrobHistoryItemsCache, true, cancelKey);
				newItem.isSelected = false;
				newItems.push(newItem);
			}

			await Cache.set({ scrobHistoryItems: scrobHistoryItemsCache });
			await store.update(newItems, true);
			await Shared.events.dispatch('HISTORY_SYNC_SUCCESS', null, {
				added: { count: addedCount },
			});
		} catch (err) {
			if (Shared.errors.validate(err)) {
				Shared.errors.error('Failed to sync history.', err);
				await store.update(newItems, true);
				await Shared.events.dispatch('HISTORY_SYNC_ERROR', null, { error: err });
			}
		}
	}
}

export const ScrobSync = new _ScrobSync();
