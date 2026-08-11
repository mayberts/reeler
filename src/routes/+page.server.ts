import { desc, eq, isNotNull, or, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { mediaItems, watchHistory } from '$lib/server/db/schema';
import { getOwnedLists } from '$lib/server/lists';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) error(401, 'Not authenticated');
	const user = locals.user;

	const [recentHistory, myLists, recentMovies, recentShows, [heroItem]] = await Promise.all([
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
		recentHistory,
		myLists,
		recentMovies,
		recentShows,
		heroItem: heroItem ?? null
	};
};
