import { error, fail } from '@sveltejs/kit';
import { count } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users, mediaItems, watchHistory } from '$lib/server/db/schema';
import {
	getAppSettings,
	getAppSettingsSource,
	updateAppSettings,
	isAccentColor
} from '$lib/server/settings';
import { verifyPlexConnection } from '$lib/server/plex/client';
import { verifyTmdbToken } from '$lib/server/tmdb/client';
import { verifyTvdbKey } from '$lib/server/tvdb/client';
import { syncLibrary } from '$lib/server/sync/library';
import { backfillWatchHistory, backfillAllUsers } from '$lib/server/sync/history';
import { repairOrphanedTrackParents } from '$lib/server/sync/media-item';
import type { Actions, PageServerLoad } from './$types';
import type { RequestEvent } from '@sveltejs/kit';

function requireAdmin({ locals }: RequestEvent) {
	if (!locals.user) error(401, 'Not authenticated');
	if (!locals.user.isAdmin) error(403, 'Admin access required');
	return locals.user;
}

function str(form: FormData, key: string): string {
	const value = form.get(key);
	return typeof value === 'string' ? value.trim() : '';
}

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const [settings, source, [userCount], [mediaCount], [historyCount]] = await Promise.all([
		getAppSettings(),
		getAppSettingsSource(),
		db.select({ value: count() }).from(users),
		db.select({ value: count() }).from(mediaItems),
		db.select({ value: count() }).from(watchHistory)
	]);
	return {
		settings,
		source,
		userCount: userCount.value,
		mediaCount: mediaCount.value,
		historyCount: historyCount.value
	};
};

export const actions: Actions = {
	savePlex: async (event) => {
		requireAdmin(event);
		const form = await event.request.formData();

		const plexServerUrl = str(form, 'plexServerUrl');
		const plexToken = str(form, 'plexToken');
		const plexWebhookToken = str(form, 'plexWebhookToken');
		const plexClientIdentifier = str(form, 'plexClientIdentifier');

		if (plexServerUrl || plexToken) {
			if (!plexServerUrl || !plexToken) {
				return fail(400, {
					card: 'plex' as const,
					message: 'Server URL and token are both needed together.'
				});
			}
			const ok = await verifyPlexConnection(plexServerUrl, plexToken);
			if (!ok) {
				return fail(400, {
					card: 'plex' as const,
					message: 'Could not connect to Plex with this server URL and token.'
				});
			}
		}

		await updateAppSettings({
			plexServerUrl: plexServerUrl || null,
			plexToken: plexToken || null,
			plexWebhookToken: plexWebhookToken || null,
			plexClientIdentifier: plexClientIdentifier || null
		});

		return { card: 'plex' as const, success: true };
	},

	saveMetadata: async (event) => {
		requireAdmin(event);
		const form = await event.request.formData();

		const tmdbReadAccessToken = str(form, 'tmdbReadAccessToken');
		const tvdbApiKey = str(form, 'tvdbApiKey');

		if (tmdbReadAccessToken && !(await verifyTmdbToken(tmdbReadAccessToken))) {
			return fail(400, {
				card: 'metadata' as const,
				message: 'This does not look like a valid TMDB Read Access Token.'
			});
		}

		if (tvdbApiKey && !(await verifyTvdbKey(tvdbApiKey))) {
			return fail(400, {
				card: 'metadata' as const,
				message: 'This does not look like a valid TVDB API key.'
			});
		}

		await updateAppSettings({
			tmdbReadAccessToken: tmdbReadAccessToken || null,
			tvdbApiKey: tvdbApiKey || null
		});

		return { card: 'metadata' as const, success: true };
	},

	setAccentColor: async (event) => {
		requireAdmin(event);
		const form = await event.request.formData();
		const value = str(form, 'accentColor');
		if (!isAccentColor(value)) return fail(400, { message: 'Invalid accent color' });
		await updateAppSettings({ accentColor: value });
		return { success: true };
	},

	setTwentyFourHourTime: async (event) => {
		requireAdmin(event);
		const form = await event.request.formData();
		await updateAppSettings({ twentyFourHourTime: str(form, 'value') === 'true' });
		return { success: true };
	},

	sync: async (event) => {
		const user = requireAdmin(event);

		try {
			const library = await syncLibrary();
			const history = user.plexAccountId
				? await backfillWatchHistory(user.id, user.plexAccountId)
				: { entriesSeen: 0, entriesInserted: 0 };
			const repair = await repairOrphanedTrackParents();

			return { card: 'sync' as const, success: true, library, history, repair };
		} catch (err) {
			return fail(502, {
				card: 'sync' as const,
				message: err instanceof Error ? err.message : 'Sync failed'
			});
		}
	},

	/**
	 * A full, unbounded re-pull of every linked user's watch history straight from
	 * Plex's `/status/sessions/history/all` log — recovery for "I lost my history in
	 * Reeler" (a bad migration, an accidental `DELETE`, etc.), not something that runs
	 * on any timer. `backfillWatchHistory` dedupes on (user, item, watchedAt), so
	 * running this repeatedly is always safe — it only ever fills gaps, never
	 * duplicates. Deliberately separate from the regular `sync` action above, which
	 * only backfills the account that clicked it and is meant to run often; this one
	 * is for every linked household member and meant to run rarely.
	 */
	fullHistorySync: async (event) => {
		requireAdmin(event);

		try {
			const results = await backfillAllUsers();
			const entriesSeen = results.reduce((sum, r) => sum + r.entriesSeen, 0);
			const entriesInserted = results.reduce((sum, r) => sum + r.entriesInserted, 0);

			return {
				card: 'fullHistorySync' as const,
				success: true,
				usersScanned: results.length,
				entriesSeen,
				entriesInserted
			};
		} catch (err) {
			return fail(502, {
				card: 'fullHistorySync' as const,
				message: err instanceof Error ? err.message : 'Full history resync failed'
			});
		}
	}
};
