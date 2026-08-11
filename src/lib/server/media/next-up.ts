import { and, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mediaItems, watchHistory, type MediaItem } from '$lib/server/db/schema';
import { getShowProgress } from './show-progress';

export interface NextUpItem {
	show: MediaItem;
	episode: MediaItem;
	/** Most recent watchedAt among the show's watched episodes — used to order shows by
	 *  "watched most recently" the same way Trakt's Up Next does. */
	lastWatchedAt: Date;
}

/**
 * Shows with at least one watched episode but not all of them ("in progress"), each
 * paired with the next unwatched episode in season/episode order. Ordered by most
 * recently watched first. Episodes carry their own seasonNumber/episodeNumber directly
 * (denormalized on the row), so ordering them doesn't need a season lookup — only the
 * episode -> season -> show hop, same two-step resolution `getShowProgress` already
 * uses for this hierarchy.
 */
export async function getNextUp(userId: string, limit = 20): Promise<NextUpItem[]> {
	const shows = await db.query.mediaItems.findMany({ where: eq(mediaItems.type, 'show') });
	if (shows.length === 0) return [];

	const showIds = shows.map((s) => s.id);
	const progress = await getShowProgress(userId, showIds);
	const inProgressIds = showIds.filter((id) => {
		const p = progress.get(id)!;
		return p.watchedEpisodes > 0 && p.watchedEpisodes < p.totalEpisodes;
	});
	if (inProgressIds.length === 0) return [];

	const seasons = await db
		.select({ id: mediaItems.id, showId: mediaItems.parentId })
		.from(mediaItems)
		.where(and(eq(mediaItems.type, 'season'), inArray(mediaItems.parentId, inProgressIds)));
	if (seasons.length === 0) return [];
	const seasonIds = seasons.map((s) => s.id);
	const seasonToShow = new Map(seasons.map((s) => [s.id, s.showId as string]));

	const episodes = await db.query.mediaItems.findMany({
		where: and(eq(mediaItems.type, 'episode'), inArray(mediaItems.parentId, seasonIds))
	});
	const episodeIds = episodes.map((e) => e.id);

	const watchRows = episodeIds.length
		? await db
				.select({ mediaItemId: watchHistory.mediaItemId, watchedAt: watchHistory.watchedAt })
				.from(watchHistory)
				.where(and(eq(watchHistory.userId, userId), inArray(watchHistory.mediaItemId, episodeIds)))
		: [];
	const watchedIds = new Set(watchRows.map((r) => r.mediaItemId));
	const latestWatchedAt = new Map<string, Date>();
	for (const row of watchRows) {
		const current = latestWatchedAt.get(row.mediaItemId);
		if (!current || row.watchedAt > current) latestWatchedAt.set(row.mediaItemId, row.watchedAt);
	}

	const episodesByShow = new Map<string, MediaItem[]>();
	for (const ep of episodes) {
		const showId = ep.parentId ? seasonToShow.get(ep.parentId) : null;
		if (!showId) continue;
		if (!episodesByShow.has(showId)) episodesByShow.set(showId, []);
		episodesByShow.get(showId)!.push(ep);
	}

	const showsById = new Map(shows.map((s) => [s.id, s]));
	const results: NextUpItem[] = [];

	for (const showId of inProgressIds) {
		const show = showsById.get(showId);
		const showEpisodes = episodesByShow.get(showId);
		if (!show || !showEpisodes) continue;

		showEpisodes.sort((a, b) => {
			const seasonDiff = (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0);
			return seasonDiff !== 0 ? seasonDiff : (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0);
		});

		const nextEpisode = showEpisodes.find((ep) => !watchedIds.has(ep.id));
		if (!nextEpisode) continue;

		let lastWatchedAt: Date | null = null;
		for (const ep of showEpisodes) {
			const watchedAt = latestWatchedAt.get(ep.id);
			if (watchedAt && (!lastWatchedAt || watchedAt > lastWatchedAt)) lastWatchedAt = watchedAt;
		}
		if (!lastWatchedAt) continue;

		results.push({ show, episode: nextEpisode, lastWatchedAt });
	}

	results.sort((a, b) => b.lastWatchedAt.getTime() - a.lastWatchedAt.getTime());
	return results.slice(0, limit);
}
