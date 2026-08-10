import { and, count, countDistinct, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mediaItems, watchHistory } from '$lib/server/db/schema';

export interface ShowProgress {
	watchedEpisodes: number;
	totalEpisodes: number;
}

/**
 * Real per-show completion (distinct watched episodes / total episodes), for a given
 * set of show ids. Deliberately not read from the show's own `watch_history` rows —
 * like an album (see DESIGN.md), a show never gets a real one: Plex scrobbles fire per
 * episode, never per show, so the show's own row only ever comes from a stray/manual
 * write and isn't a meaningful "how much of this have I watched" signal.
 *
 * Resolves episode -> season -> show in two batched lookups rather than a self-join,
 * matching the pattern already used for the same hierarchy in stats/+page.server.ts.
 */
export async function getShowProgress(
	userId: string,
	showIds: string[]
): Promise<Map<string, ShowProgress>> {
	const result = new Map<string, ShowProgress>(
		showIds.map((id) => [id, { watchedEpisodes: 0, totalEpisodes: 0 }])
	);
	if (showIds.length === 0) return result;

	const seasons = await db
		.select({ id: mediaItems.id, showId: mediaItems.parentId })
		.from(mediaItems)
		.where(and(eq(mediaItems.type, 'season'), inArray(mediaItems.parentId, showIds)));
	if (seasons.length === 0) return result;

	const seasonIds = seasons.map((s) => s.id);
	const seasonToShow = new Map(seasons.map((s) => [s.id, s.showId]));

	const [totalRows, watchedRows] = await Promise.all([
		db
			.select({ seasonId: mediaItems.parentId, total: count() })
			.from(mediaItems)
			.where(and(eq(mediaItems.type, 'episode'), inArray(mediaItems.parentId, seasonIds)))
			.groupBy(mediaItems.parentId),
		db
			.select({
				seasonId: mediaItems.parentId,
				watched: countDistinct(watchHistory.mediaItemId)
			})
			.from(watchHistory)
			.innerJoin(mediaItems, eq(watchHistory.mediaItemId, mediaItems.id))
			.where(
				and(
					eq(watchHistory.userId, userId),
					eq(mediaItems.type, 'episode'),
					inArray(mediaItems.parentId, seasonIds)
				)
			)
			.groupBy(mediaItems.parentId)
	]);

	for (const row of totalRows) {
		const showId = row.seasonId ? seasonToShow.get(row.seasonId) : null;
		if (!showId) continue;
		result.get(showId)!.totalEpisodes += row.total;
	}
	for (const row of watchedRows) {
		const showId = row.seasonId ? seasonToShow.get(row.seasonId) : null;
		if (!showId) continue;
		result.get(showId)!.watchedEpisodes += row.watched;
	}

	return result;
}
