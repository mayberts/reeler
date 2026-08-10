import { count, desc, eq } from 'drizzle-orm';
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

	const [[userCount], [mediaCount], [historyCount], recentHistory, myLists] = await Promise.all([
		db.select({ value: count() }).from(users),
		db.select({ value: count() }).from(mediaItems),
		db.select({ value: count() }).from(watchHistory),
		db.query.watchHistory.findMany({
			where: eq(watchHistory.userId, user.id),
			orderBy: desc(watchHistory.watchedAt),
			limit: 10,
			with: { mediaItem: true }
		}),
		getOwnedLists(user.id)
	]);

	return {
		userCount: userCount.value,
		mediaCount: mediaCount.value,
		historyCount: historyCount.value,
		recentHistory,
		myLists
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
