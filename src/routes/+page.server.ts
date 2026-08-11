import { count, desc, eq, isNotNull, or, sql } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, mediaItems, watchHistory } from '$lib/server/db/schema';
import { syncLibrary } from '$lib/server/sync/library';
import { backfillWatchHistory } from '$lib/server/sync/history';
import { repairOrphanedTrackParents } from '$lib/server/sync/media-item';
import { getOwnedLists } from '$lib/server/lists';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) error(401, 'Not authenticated');
	const user = locals.user;

	const [
		[userCount],
		[mediaCount],
		[historyCount],
		recentHistory,
		myLists,
		recentMovies,
		recentShows,
		[heroItem]
	] = await Promise.all([
		db.select({ value: count() }).from(users),
		db.select({ value: count() }).from(mediaItems),
		db.select({ value: count() }).from(watchHistory),
		db.query.watchHistory.findMany({
			where: eq(watchHistory.userId, user.id),
			orderBy: desc(watchHistory.watchedAt),
			limit: 10,
			with: { mediaItem: true }
		}),
		getOwnedLists(user.id),
		db.query.mediaItems.findMany({
			where: eq(mediaItems.type, 'movie'),
			orderBy: desc(mediaItems.createdAt),
			limit: 15
		}),
		db.query.mediaItems.findMany({
			where: eq(mediaItems.type, 'show'),
			orderBy: desc(mediaItems.createdAt),
			limit: 15
		}),
		// A random backdrop from the library for the dashboard hero — re-picked on
		// every load (this `load` reruns per navigation), not cached client-side.
		db
			.select({ id: mediaItems.id, title: mediaItems.title })
			.from(mediaItems)
			.where(or(isNotNull(mediaItems.plexArt), isNotNull(mediaItems.backdropUrl)))
			.orderBy(sql`RANDOM()`)
			.limit(1)
	]);

	return {
		userCount: userCount.value,
		mediaCount: mediaCount.value,
		historyCount: historyCount.value,
		recentHistory,
		myLists,
		recentMovies,
		recentShows,
		heroItem: heroItem ?? null
	};
};

export const actions: Actions = {
	sync: async ({ locals }) => {
		if (!locals.user) return fail(401);
		const user = locals.user;

		try {
			const library = await syncLibrary();
			const history = user.plexAccountId
				? await backfillWatchHistory(user.id, user.plexAccountId)
				: { entriesSeen: 0, entriesInserted: 0 };
			const repair = await repairOrphanedTrackParents();

			return { success: true, library, history, repair };
		} catch (err) {
			return fail(502, { message: err instanceof Error ? err.message : 'Sync failed' });
		}
	}
};
