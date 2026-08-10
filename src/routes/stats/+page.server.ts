import { error } from '@sveltejs/kit';
import { and, avg, count, countDistinct, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { watchHistory, ratings, mediaItems, type MediaType } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

const MONTH_EXPR = sql<string>`strftime('%Y-%m', ${watchHistory.watchedAt}, 'unixepoch')`;
const WEEKDAY_EXPR = sql<string>`strftime('%w', ${watchHistory.watchedAt}, 'unixepoch')`;

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseGenres(raw: string | null): string[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((g): g is string => typeof g === 'string') : [];
	} catch {
		return [];
	}
}

/** Tallies genre tags weighted by play count, returns the top N sorted descending. */
function topGenres(rows: { genres: string | null; weight: number }[], limit = 10) {
	const counts = new Map<string, number>();
	for (const row of rows) {
		for (const genre of parseGenres(row.genres)) {
			counts.set(genre, (counts.get(genre) ?? 0) + row.weight);
		}
	}
	return Array.from(counts.entries())
		.map(([genre, count]) => ({ genre, count }))
		.sort((a, b) => b.count - a.count)
		.slice(0, limit);
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) error(401, 'Not authenticated');
	const userId = locals.user.id;

	const twelveMonthsAgo = new Date();
	twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
	twelveMonthsAgo.setDate(1);
	twelveMonthsAgo.setHours(0, 0, 0, 0);

	const [
		byType,
		monthlyRows,
		weekdayRows,
		ratingsByType,
		ratingDistributionRows,
		collectionRows,
		topWatched,
		topListened,
		topRated,
		episodeWatchBySeason,
		movieWatchRows,
		trackWatchByAlbum
	] = await Promise.all([
		// Per-type: total play events, distinct items played, and total runtime.
		db
			.select({
				type: mediaItems.type,
				events: count(),
				uniqueItems: countDistinct(watchHistory.mediaItemId),
				minutes: sql<number>`coalesce(sum(${mediaItems.runtimeMinutes}), 0)`
			})
			.from(watchHistory)
			.innerJoin(mediaItems, eq(watchHistory.mediaItemId, mediaItems.id))
			.where(eq(watchHistory.userId, userId))
			.groupBy(mediaItems.type),
		db
			.select({
				month: MONTH_EXPR,
				type: mediaItems.type,
				count: count(),
				minutes: sql<number>`coalesce(sum(${mediaItems.runtimeMinutes}), 0)`
			})
			.from(watchHistory)
			.innerJoin(mediaItems, eq(watchHistory.mediaItemId, mediaItems.id))
			.where(and(eq(watchHistory.userId, userId), gte(watchHistory.watchedAt, twelveMonthsAgo)))
			.groupBy(MONTH_EXPR, mediaItems.type)
			.orderBy(MONTH_EXPR),
		db
			.select({ weekday: WEEKDAY_EXPR, count: count() })
			.from(watchHistory)
			.where(and(eq(watchHistory.userId, userId), gte(watchHistory.watchedAt, twelveMonthsAgo)))
			.groupBy(WEEKDAY_EXPR),
		db
			.select({ type: mediaItems.type, totalRatings: count(), avgRating: avg(ratings.value) })
			.from(ratings)
			.innerJoin(mediaItems, eq(ratings.mediaItemId, mediaItems.id))
			.where(eq(ratings.userId, userId))
			.groupBy(mediaItems.type),
		db
			.select({ value: ratings.value, count: count() })
			.from(ratings)
			.where(eq(ratings.userId, userId))
			.groupBy(ratings.value),
		// Global collection size, not user-scoped — how much of the library exists at all.
		db
			.select({ type: mediaItems.type, count: count() })
			.from(mediaItems)
			.where(inArray(mediaItems.type, ['movie', 'show', 'episode', 'album']))
			.groupBy(mediaItems.type),
		db
			.select({
				mediaItemId: watchHistory.mediaItemId,
				title: mediaItems.title,
				year: mediaItems.year,
				type: mediaItems.type,
				watchCount: count()
			})
			.from(watchHistory)
			.innerJoin(mediaItems, eq(watchHistory.mediaItemId, mediaItems.id))
			.where(
				and(eq(watchHistory.userId, userId), inArray(mediaItems.type, ['movie', 'show', 'episode']))
			)
			.groupBy(watchHistory.mediaItemId)
			.orderBy(desc(count()))
			.limit(5),
		// Same shape as topWatched, restricted to the audio types — kept as a separate
		// list rather than one type-agnostic ranking, since "most watched" mixing in
		// tracks (or vice versa) doesn't mean anything as a single ranking.
		db
			.select({
				mediaItemId: watchHistory.mediaItemId,
				title: mediaItems.title,
				year: mediaItems.year,
				type: mediaItems.type,
				watchCount: count()
			})
			.from(watchHistory)
			.innerJoin(mediaItems, eq(watchHistory.mediaItemId, mediaItems.id))
			.where(and(eq(watchHistory.userId, userId), inArray(mediaItems.type, ['track', 'album'])))
			.groupBy(watchHistory.mediaItemId)
			.orderBy(desc(count()))
			.limit(5),
		db
			.select({
				mediaItemId: ratings.mediaItemId,
				title: mediaItems.title,
				year: mediaItems.year,
				type: mediaItems.type,
				value: ratings.value
			})
			.from(ratings)
			.innerJoin(mediaItems, eq(ratings.mediaItemId, mediaItems.id))
			.where(eq(ratings.userId, userId))
			.orderBy(desc(ratings.value))
			.limit(5),
		// Episodes don't carry their own genre tags — only the show does — so genre
		// attribution and "shows watched" both go through the episode -> season -> show
		// chain rather than reading straight off the watched item.
		db
			.select({ seasonId: mediaItems.parentId, count: count() })
			.from(watchHistory)
			.innerJoin(mediaItems, eq(watchHistory.mediaItemId, mediaItems.id))
			.where(and(eq(watchHistory.userId, userId), eq(mediaItems.type, 'episode')))
			.groupBy(mediaItems.parentId),
		db
			.select({ id: mediaItems.id, genres: mediaItems.genres, count: count() })
			.from(watchHistory)
			.innerJoin(mediaItems, eq(watchHistory.mediaItemId, mediaItems.id))
			.where(and(eq(watchHistory.userId, userId), eq(mediaItems.type, 'movie')))
			.groupBy(mediaItems.id),
		// Same one-hop idea as episodes, but tracks -> album is the only hop needed —
		// and this doubles as the real "has this album actually been listened to" signal
		// (see the DESIGN.md note on why an album's own watched status was removed).
		db
			.select({ albumId: mediaItems.parentId, count: count() })
			.from(watchHistory)
			.innerJoin(mediaItems, eq(watchHistory.mediaItemId, mediaItems.id))
			.where(and(eq(watchHistory.userId, userId), eq(mediaItems.type, 'track')))
			.groupBy(mediaItems.parentId)
	]);

	// Resolve episode -> season -> show, and track -> album, in two more batched lookups
	// rather than N+1 queries.
	const seasonIds = episodeWatchBySeason.map((r) => r.seasonId).filter((id): id is string => !!id);
	const albumIds = trackWatchByAlbum.map((r) => r.albumId).filter((id): id is string => !!id);

	const [seasonRows, albumRows] = await Promise.all([
		seasonIds.length
			? db
					.select({ id: mediaItems.id, showId: mediaItems.parentId })
					.from(mediaItems)
					.where(and(eq(mediaItems.type, 'season'), inArray(mediaItems.id, seasonIds)))
			: Promise.resolve([]),
		albumIds.length
			? db
					.select({ id: mediaItems.id, genres: mediaItems.genres })
					.from(mediaItems)
					.where(and(eq(mediaItems.type, 'album'), inArray(mediaItems.id, albumIds)))
			: Promise.resolve([])
	]);

	const showIds = seasonRows.map((r) => r.showId).filter((id): id is string => !!id);
	const showRows = showIds.length
		? await db
				.select({ id: mediaItems.id, genres: mediaItems.genres })
				.from(mediaItems)
				.where(and(eq(mediaItems.type, 'show'), inArray(mediaItems.id, showIds)))
		: [];

	const seasonToShow = new Map(seasonRows.map((r) => [r.id, r.showId]));
	const showGenres = new Map(showRows.map((r) => [r.id, r.genres]));
	const albumGenres = new Map(albumRows.map((r) => [r.id, r.genres]));

	const uniqueShowIds = new Set<string>();
	const episodeGenreRows: { genres: string | null; weight: number }[] = [];
	for (const row of episodeWatchBySeason) {
		const showId = row.seasonId ? (seasonToShow.get(row.seasonId) ?? null) : null;
		if (showId) {
			uniqueShowIds.add(showId);
			episodeGenreRows.push({ genres: showGenres.get(showId) ?? null, weight: row.count });
		}
	}

	const musicGenreRows: { genres: string | null; weight: number }[] = trackWatchByAlbum
		.filter((row) => row.albumId)
		.map((row) => ({ genres: albumGenres.get(row.albumId!) ?? null, weight: row.count }));

	const listenedAlbumIds = new Set(albumIds);

	const movieGenreRows = movieWatchRows.map((row) => ({ genres: row.genres, weight: row.count }));

	// Pivot the flat monthly rows into a fixed 12-month axis with one bucket per type,
	// so the chart can plot a continuous, gap-free series even for months with no activity.
	const monthKeys: string[] = [];
	const cursor = new Date(twelveMonthsAgo);
	for (let i = 0; i < 12; i++) {
		monthKeys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
		cursor.setMonth(cursor.getMonth() + 1);
	}
	const monthlyByKey = new Map(
		monthKeys.map((key) => [
			key,
			{ count: {} as Record<string, number>, minutes: {} as Record<string, number> }
		])
	);
	for (const row of monthlyRows) {
		const bucket = monthlyByKey.get(row.month);
		if (!bucket) continue;
		bucket.count[row.type] = row.count;
		bucket.minutes[row.type] = row.minutes;
	}
	const monthlyActivity = monthKeys.map((month) => {
		const bucket = monthlyByKey.get(month)!;
		return {
			month,
			counts: {
				movie: bucket.count.movie ?? 0,
				episode: bucket.count.episode ?? 0,
				track: bucket.count.track ?? 0
			},
			minutes: {
				movie: bucket.minutes.movie ?? 0,
				episode: bucket.minutes.episode ?? 0,
				track: bucket.minutes.track ?? 0
			}
		};
	});

	// How many of each weekday actually fell in the 12-month window, so raw counts can
	// be turned into a true per-weekday average rather than a total that just favors
	// whichever weekday happens to occur more often.
	const weekdayOccurrences = [0, 0, 0, 0, 0, 0, 0];
	const dayCursor = new Date(twelveMonthsAgo);
	const now = new Date();
	while (dayCursor <= now) {
		weekdayOccurrences[dayCursor.getDay()]++;
		dayCursor.setDate(dayCursor.getDate() + 1);
	}
	const weekdayTotals = [0, 0, 0, 0, 0, 0, 0];
	for (const row of weekdayRows) {
		weekdayTotals[Number(row.weekday)] = row.count;
	}
	const weekdayActivity = WEEKDAY_LABELS.map((label, i) => ({
		label,
		average: weekdayOccurrences[i] > 0 ? weekdayTotals[i] / weekdayOccurrences[i] : 0
	}));

	function byTypeStat(type: MediaType) {
		const row = byType.find((r) => r.type === type);
		return {
			events: row?.events ?? 0,
			uniqueItems: row?.uniqueItems ?? 0,
			minutes: row?.minutes ?? 0
		};
	}
	function ratingStat(type: MediaType) {
		const row = ratingsByType.find((r) => r.type === type);
		return {
			totalRatings: row?.totalRatings ?? 0,
			avgRating: row?.avgRating ? Number(row.avgRating) : null
		};
	}
	function collectionCount(type: MediaType) {
		return collectionRows.find((r) => r.type === type)?.count ?? 0;
	}

	const ratingDistribution = Array.from({ length: 10 }, (_, i) => {
		const value = i + 1;
		return { value, count: ratingDistributionRows.find((r) => r.value === value)?.count ?? 0 };
	});

	const movies = byTypeStat('movie');
	const episodes = byTypeStat('episode');
	const tracks = byTypeStat('track');

	return {
		hero: {
			moviesWatched: movies.uniqueItems,
			showsWatched: uniqueShowIds.size,
			episodesWatched: episodes.uniqueItems,
			tracksPlayed: tracks.uniqueItems,
			watchMinutes: movies.minutes + episodes.minutes,
			listeningMinutes: tracks.minutes
		},
		watchTimeByType: { movies: movies.minutes, shows: episodes.minutes, music: tracks.minutes },
		ratings: {
			movies: ratingStat('movie'),
			shows: ratingStat('show'),
			music: ratingStat('album')
		},
		ratingDistribution,
		monthlyActivity,
		weekdayActivity,
		genres: {
			movies: topGenres(movieGenreRows),
			shows: topGenres(episodeGenreRows),
			music: topGenres(musicGenreRows)
		},
		collection: {
			movies: collectionCount('movie'),
			shows: collectionCount('show'),
			episodes: collectionCount('episode'),
			albums: collectionCount('album')
		},
		watchedVsUnwatched: {
			movies: { watched: movies.uniqueItems, total: collectionCount('movie') },
			shows: { watched: uniqueShowIds.size, total: collectionCount('show') },
			albums: { watched: listenedAlbumIds.size, total: collectionCount('album') }
		},
		topWatched,
		topListened,
		topRated
	};
};
