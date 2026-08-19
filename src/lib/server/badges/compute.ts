import { and, asc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from '$lib/server/db';
import { mediaItems, watchHistory, lists } from '$lib/server/db/schema';
import { BADGES, type BadgeCategory, type BadgeDef, type BadgeIconName } from './catalog';

export interface BadgeProgress {
	id: string;
	name: string;
	description: string;
	category: BadgeCategory;
	icon: BadgeIconName;
	/** 0 = locked, 1..tiers.length = highest tier reached. */
	tierIndex: number;
	tierCount: number;
	currentValue: number;
	/** Threshold for the next tier, or null once every tier is maxed out. */
	nextTarget: number | null;
	/** When the current tier was reached — null while `tierIndex` is 0. */
	unlockedAt: Date | null;
}

interface TierResult {
	tierIndex: number;
	currentValue: number;
	nextTarget: number | null;
	unlockedAt: Date | null;
}

/**
 * `dates` has one entry per unit, in the order each unit was reached (e.g. one date per
 * distinct movie watched, ordered by when it was first watched) — `dates.length` is
 * therefore the current count, and `dates[tiers[i] - 1]` is when tier `i` was crossed.
 */
function tierProgressFromDates(dates: Date[], tiers: number[]): TierResult {
	const currentValue = dates.length;
	let tierIndex = 0;
	for (let i = 0; i < tiers.length; i++) if (currentValue >= tiers[i]) tierIndex = i + 1;
	return {
		tierIndex,
		currentValue,
		nextTarget: tierIndex < tiers.length ? tiers[tierIndex] : null,
		unlockedAt: tierIndex > 0 ? (dates[tiers[tierIndex - 1] - 1] ?? null) : null
	};
}

/** Same idea as `tierProgressFromDates`, but for a metric measured in cumulative
 *  minutes (hours watched/listened) rather than one discrete unit per date. */
function tierProgressFromCumulativeMinutes(
	rows: { watchedAt: Date; minutes: number }[],
	tierHours: number[]
): TierResult {
	const tierMinutes = tierHours.map((h) => h * 60);
	const thresholdDates: (Date | null)[] = tierMinutes.map(() => null);
	let cumulative = 0;
	for (const row of rows) {
		cumulative += row.minutes;
		for (let i = 0; i < tierMinutes.length; i++) {
			if (thresholdDates[i] === null && cumulative >= tierMinutes[i])
				thresholdDates[i] = row.watchedAt;
		}
	}
	let tierIndex = 0;
	for (let i = 0; i < tierMinutes.length; i++) if (thresholdDates[i] !== null) tierIndex = i + 1;
	return {
		tierIndex,
		currentValue: Math.floor(cumulative / 60),
		nextTarget: tierIndex < tierHours.length ? tierHours[tierIndex] : null,
		unlockedAt: tierIndex > 0 ? thresholdDates[tierIndex - 1] : null
	};
}

/** Longest run of consecutive calendar days with at least one watch/listen — the
 *  all-time best streak, not just the currently active one. */
function tierProgressFromStreak(distinctDaysAsc: string[], tiers: number[]): TierResult {
	const thresholdDates: (Date | null)[] = tiers.map(() => null);
	let currentRun = 0;
	let bestRun = 0;
	let prevDay: Date | null = null;
	for (const dayStr of distinctDaysAsc) {
		const day = new Date(`${dayStr}T00:00:00Z`);
		const diffDays = prevDay ? Math.round((day.getTime() - prevDay.getTime()) / 86_400_000) : null;
		currentRun = diffDays === 1 ? currentRun + 1 : 1;
		prevDay = day;
		if (currentRun > bestRun) bestRun = currentRun;
		for (let i = 0; i < tiers.length; i++) {
			if (thresholdDates[i] === null && bestRun >= tiers[i]) thresholdDates[i] = day;
		}
	}
	let tierIndex = 0;
	for (let i = 0; i < tiers.length; i++) if (thresholdDates[i] !== null) tierIndex = i + 1;
	return {
		tierIndex,
		currentValue: bestRun,
		nextTarget: tierIndex < tiers.length ? tiers[tierIndex] : null,
		unlockedAt: tierIndex > 0 ? thresholdDates[tierIndex - 1] : null
	};
}

/** Highest single-day watch/listen count, and the first day each tier was crossed. */
function tierProgressFromDailyMax(perDayCounts: Map<string, number>, tiers: number[]): TierResult {
	const entries = [...perDayCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	const thresholdDates: (Date | null)[] = tiers.map(() => null);
	let currentValue = 0;
	for (const [dayStr, dayCount] of entries) {
		if (dayCount > currentValue) currentValue = dayCount;
		for (let i = 0; i < tiers.length; i++) {
			if (thresholdDates[i] === null && dayCount >= tiers[i])
				thresholdDates[i] = new Date(`${dayStr}T00:00:00Z`);
		}
	}
	let tierIndex = 0;
	for (let i = 0; i < tiers.length; i++) if (thresholdDates[i] !== null) tierIndex = i + 1;
	return {
		tierIndex,
		currentValue,
		nextTarget: tierIndex < tiers.length ? tiers[tierIndex] : null,
		unlockedAt: tierIndex > 0 ? thresholdDates[tierIndex - 1] : null
	};
}

interface WatchRow {
	mediaItemId: string;
	type: (typeof mediaItems.$inferSelect)['type'];
	watchedAt: Date;
	genres: string | null;
	artist: string | null;
	runtimeMinutes: number | null;
	parentId: string | null;
}

function byType(rows: WatchRow[], type: WatchRow['type']) {
	return rows.filter((r) => r.type === type);
}

/** One entry per distinct media item, keeping its earliest watch — `rows` must already
 *  be sorted ascending by `watchedAt`. */
function distinctTitlesFirstSeen(rows: WatchRow[]) {
	const seen = new Map<string, WatchRow>();
	for (const row of rows) if (!seen.has(row.mediaItemId)) seen.set(row.mediaItemId, row);
	return [...seen.values()];
}

function distinctFirstSeenDates(rows: WatchRow[]): Date[] {
	return distinctTitlesFirstSeen(rows).map((r) => r.watchedAt);
}

/** The date each *second* watch of a title happened, one entry per title that was ever
 *  watched more than once, ordered by when that second watch occurred. */
function secondWatchDates(rows: WatchRow[]): Date[] {
	const seenCount = new Map<string, number>();
	const dates: Date[] = [];
	for (const row of rows) {
		const count = (seenCount.get(row.mediaItemId) ?? 0) + 1;
		seenCount.set(row.mediaItemId, count);
		if (count === 2) dates.push(row.watchedAt);
	}
	return dates;
}

/** First-seen date of every distinct string in `value` (a single artist name, or the
 *  parsed genre list) across a set of titles — a title contributing several genres at
 *  once introduces them all on that same date. */
function distinctValueFirstSeenDates(
	titles: { watchedAt: Date; value: string | string[] | null }[]
): Date[] {
	const seen = new Set<string>();
	const dates: Date[] = [];
	const sorted = [...titles].sort((a, b) => a.watchedAt.getTime() - b.watchedAt.getTime());
	for (const t of sorted) {
		const values = Array.isArray(t.value) ? t.value : t.value ? [t.value] : [];
		for (const v of values) {
			if (seen.has(v)) continue;
			seen.add(v);
			dates.push(t.watchedAt);
		}
	}
	return dates.sort((a, b) => a.getTime() - b.getTime());
}

function parseGenres(json: string | null): string[] {
	if (!json) return [];
	try {
		const parsed = JSON.parse(json);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function dailyCounts(rows: WatchRow[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const row of rows) {
		const day = row.watchedAt.toISOString().slice(0, 10);
		counts.set(day, (counts.get(day) ?? 0) + 1);
	}
	return counts;
}

function distinctDaysAsc(rows: WatchRow[]): string[] {
	return [...new Set(rows.map((r) => r.watchedAt.toISOString().slice(0, 10)))].sort();
}

/**
 * A show's watched-episode ids and its last watch — used both to check whether the show
 * is fully watched (against its known total episode count) and, if so, when that
 * happened: the most recent of its watched episodes' dates, since that's necessarily
 * when the last remaining episode got checked off.
 */
async function getWatchedShowCompletion(userId: string) {
	const episodeWatches = await db
		.select({
			episodeId: mediaItems.id,
			seasonId: mediaItems.parentId,
			watchedAt: watchHistory.watchedAt
		})
		.from(watchHistory)
		.innerJoin(mediaItems, eq(watchHistory.mediaItemId, mediaItems.id))
		.where(and(eq(watchHistory.userId, userId), eq(mediaItems.type, 'episode')))
		.orderBy(asc(watchHistory.watchedAt));

	if (episodeWatches.length === 0)
		return {
			finishedShowDates: [] as Date[],
			showGenreEntries: [] as { watchedAt: Date; genres: string | null }[]
		};

	const seasonIds = [
		...new Set(episodeWatches.map((e) => e.seasonId).filter((id): id is string => !!id))
	];
	const seasons = await db
		.select({ id: mediaItems.id, showId: mediaItems.parentId })
		.from(mediaItems)
		.where(inArray(mediaItems.id, seasonIds));
	const seasonToShow = new Map(seasons.map((s) => [s.id, s.showId]));

	const showWatched = new Map<
		string,
		{ episodeIds: Set<string>; firstWatchedAt: Date; lastWatchedAt: Date }
	>();
	for (const ep of episodeWatches) {
		const showId = ep.seasonId ? seasonToShow.get(ep.seasonId) : null;
		if (!showId) continue;
		let entry = showWatched.get(showId);
		if (!entry) {
			entry = { episodeIds: new Set(), firstWatchedAt: ep.watchedAt, lastWatchedAt: ep.watchedAt };
			showWatched.set(showId, entry);
		}
		entry.episodeIds.add(ep.episodeId);
		if (ep.watchedAt > entry.lastWatchedAt) entry.lastWatchedAt = ep.watchedAt;
	}
	if (showWatched.size === 0) return { finishedShowDates: [], showGenreEntries: [] };

	const showIds = [...showWatched.keys()];
	const [totalRows, showRows] = await Promise.all([
		db
			.select({ seasonId: mediaItems.parentId, episodeId: mediaItems.id })
			.from(mediaItems)
			.where(and(eq(mediaItems.type, 'episode'), inArray(mediaItems.parentId, seasonIds))),
		db
			.select({ id: mediaItems.id, genres: mediaItems.genres })
			.from(mediaItems)
			.where(inArray(mediaItems.id, showIds))
	]);

	const totalEpisodesByShow = new Map<string, number>();
	for (const row of totalRows) {
		const showId = row.seasonId ? seasonToShow.get(row.seasonId) : null;
		if (!showId) continue;
		totalEpisodesByShow.set(showId, (totalEpisodesByShow.get(showId) ?? 0) + 1);
	}

	const finishedShowDates: Date[] = [];
	for (const [showId, entry] of showWatched) {
		const total = totalEpisodesByShow.get(showId) ?? 0;
		if (total > 0 && entry.episodeIds.size >= total) finishedShowDates.push(entry.lastWatchedAt);
	}
	finishedShowDates.sort((a, b) => a.getTime() - b.getTime());

	const showGenreEntries = showRows.map((s) => ({
		watchedAt: showWatched.get(s.id)!.firstWatchedAt,
		genres: s.genres
	}));

	return { finishedShowDates, showGenreEntries };
}

/**
 * Dates each fully-played album was completed — an album where every one of its
 * tracks (per its own `trackCount`, Plex's `leafCount` synced onto the album row, see
 * `sync/media-item.ts`) has been played at least once. Unlike show completion, this
 * needs no season/show hierarchy resolution: a track's `parentId` already points
 * straight at its album. An album with no known `trackCount` (never enriched, or
 * played before this synced) can't be judged complete and is skipped rather than
 * guessed at.
 */
async function getCompletedAlbumDates(trackRows: WatchRow[]): Promise<Date[]> {
	const byAlbum = new Map<string, { trackIds: Set<string>; lastWatchedAt: Date }>();
	for (const row of trackRows) {
		if (!row.parentId) continue;
		let entry = byAlbum.get(row.parentId);
		if (!entry) {
			entry = { trackIds: new Set(), lastWatchedAt: row.watchedAt };
			byAlbum.set(row.parentId, entry);
		}
		entry.trackIds.add(row.mediaItemId);
		if (row.watchedAt > entry.lastWatchedAt) entry.lastWatchedAt = row.watchedAt;
	}
	if (byAlbum.size === 0) return [];

	const albumIds = [...byAlbum.keys()];
	const albumRows = await db
		.select({ id: mediaItems.id, trackCount: mediaItems.trackCount })
		.from(mediaItems)
		.where(inArray(mediaItems.id, albumIds));

	const dates: Date[] = [];
	for (const album of albumRows) {
		const entry = byAlbum.get(album.id)!;
		if (album.trackCount && entry.trackIds.size >= album.trackCount) {
			dates.push(entry.lastWatchedAt);
		}
	}
	return dates.sort((a, b) => a.getTime() - b.getTime());
}

function buildProgress(def: BadgeDef, result: TierResult): BadgeProgress {
	return {
		id: def.id,
		name: def.name,
		description: def.description,
		category: def.category,
		icon: def.icon,
		tierIndex: result.tierIndex,
		tierCount: def.tiers.length,
		currentValue: result.currentValue,
		nextTarget: result.nextTarget,
		unlockedAt: result.unlockedAt
	};
}

function findBadge(id: string) {
	const def = BADGES.find((b) => b.id === id);
	if (!def) throw new Error(`Unknown badge id: ${id}`);
	return def;
}

/**
 * Every badge's current progress for a user, computed live from watch history and
 * lists — there's no stored "unlocked" state, so this always reflects exactly what the
 * underlying data says right now. Safe to call on every page load: a handful of queries
 * against a single user's history, not a full-library scan.
 */
export async function getBadgeProgress(userId: string): Promise<BadgeProgress[]> {
	const parentItems = alias(mediaItems, 'badge_parent_items');

	const [rawRows, listRows, { finishedShowDates, showGenreEntries }] = await Promise.all([
		db
			.select({
				mediaItemId: mediaItems.id,
				type: mediaItems.type,
				watchedAt: watchHistory.watchedAt,
				genres: mediaItems.genres,
				artist: mediaItems.artist,
				runtimeMinutes: mediaItems.runtimeMinutes,
				parentId: mediaItems.parentId,
				parentGenres: parentItems.genres,
				parentArtist: parentItems.artist
			})
			.from(watchHistory)
			.innerJoin(mediaItems, eq(watchHistory.mediaItemId, mediaItems.id))
			.leftJoin(parentItems, eq(mediaItems.parentId, parentItems.id))
			.where(eq(watchHistory.userId, userId))
			.orderBy(asc(watchHistory.watchedAt)),
		db
			.select({ createdAt: lists.createdAt })
			.from(lists)
			.where(eq(lists.ownerId, userId))
			.orderBy(asc(lists.createdAt)),
		getWatchedShowCompletion(userId)
	]);

	const rows: WatchRow[] = rawRows.map((r) => ({
		mediaItemId: r.mediaItemId,
		type: r.type,
		watchedAt: r.watchedAt,
		genres: r.genres ?? r.parentGenres,
		artist: r.artist ?? r.parentArtist,
		runtimeMinutes: r.runtimeMinutes,
		parentId: r.parentId
	}));

	const episodeRows = byType(rows, 'episode');
	const movieRows = byType(rows, 'movie');
	const trackRows = byType(rows, 'track');
	const albumRows = byType(rows, 'album');

	const movieShowRows = [...movieRows, ...episodeRows];
	const musicRows = [...albumRows, ...trackRows];

	const movieGenreEntries = distinctTitlesFirstSeen(movieRows).map((r) => ({
		watchedAt: r.watchedAt,
		genres: r.genres
	}));
	const genresExploredDates = distinctValueFirstSeenDates(
		[...movieGenreEntries, ...showGenreEntries].map((e) => ({
			watchedAt: e.watchedAt,
			value: parseGenres(e.genres)
		}))
	);

	const musicTitleEntries = distinctTitlesFirstSeen(musicRows);
	const artistsExploredDates = distinctValueFirstSeenDates(
		musicTitleEntries.map((r) => ({ watchedAt: r.watchedAt, value: r.artist }))
	);
	const musicGenresExploredDates = distinctValueFirstSeenDates(
		musicTitleEntries.map((r) => ({ watchedAt: r.watchedAt, value: parseGenres(r.genres) }))
	);
	const completedAlbumDates = await getCompletedAlbumDates(trackRows);

	const results: BadgeProgress[] = [
		buildProgress(
			findBadge('episodes'),
			tierProgressFromDates(distinctFirstSeenDates(episodeRows), findBadge('episodes').tiers)
		),
		buildProgress(
			findBadge('movies'),
			tierProgressFromDates(distinctFirstSeenDates(movieRows), findBadge('movies').tiers)
		),
		buildProgress(
			findBadge('shows'),
			tierProgressFromDates(finishedShowDates, findBadge('shows').tiers)
		),
		buildProgress(
			findBadge('hours'),
			tierProgressFromCumulativeMinutes(
				movieShowRows.map((r) => ({ watchedAt: r.watchedAt, minutes: r.runtimeMinutes ?? 0 })),
				findBadge('hours').tiers
			)
		),
		buildProgress(
			findBadge('streak'),
			tierProgressFromStreak(distinctDaysAsc(movieShowRows), findBadge('streak').tiers)
		),
		buildProgress(
			findBadge('genres'),
			tierProgressFromDates(genresExploredDates, findBadge('genres').tiers)
		),
		buildProgress(
			findBadge('rewatch'),
			tierProgressFromDates(secondWatchDates(episodeRows), findBadge('rewatch').tiers)
		),
		buildProgress(
			findBadge('binge_day'),
			tierProgressFromDailyMax(dailyCounts(episodeRows), findBadge('binge_day').tiers)
		),
		buildProgress(
			findBadge('lists'),
			tierProgressFromDates(
				listRows.map((r) => r.createdAt),
				findBadge('lists').tiers
			)
		),

		buildProgress(
			findBadge('tracks'),
			tierProgressFromDates(distinctFirstSeenDates(trackRows), findBadge('tracks').tiers)
		),
		buildProgress(
			findBadge('albums'),
			tierProgressFromDates(distinctFirstSeenDates(albumRows), findBadge('albums').tiers)
		),
		buildProgress(
			findBadge('artists'),
			tierProgressFromDates(artistsExploredDates, findBadge('artists').tiers)
		),
		buildProgress(
			findBadge('music_genres'),
			tierProgressFromDates(musicGenresExploredDates, findBadge('music_genres').tiers)
		),
		buildProgress(
			findBadge('music_hours'),
			tierProgressFromCumulativeMinutes(
				trackRows.map((r) => ({ watchedAt: r.watchedAt, minutes: r.runtimeMinutes ?? 0 })),
				findBadge('music_hours').tiers
			)
		),
		buildProgress(
			findBadge('music_streak'),
			tierProgressFromStreak(distinctDaysAsc(musicRows), findBadge('music_streak').tiers)
		),
		buildProgress(
			findBadge('on_repeat'),
			tierProgressFromDates(secondWatchDates(trackRows), findBadge('on_repeat').tiers)
		),
		buildProgress(
			findBadge('music_binge_day'),
			tierProgressFromDailyMax(dailyCounts(trackRows), findBadge('music_binge_day').tiers)
		),
		buildProgress(
			findBadge('album_complete'),
			tierProgressFromDates(completedAlbumDates, findBadge('album_complete').tiers)
		)
	];

	return results;
}
