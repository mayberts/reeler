import { and, asc, count, desc, eq, inArray, like, notInArray, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mediaItems, watchHistory } from '$lib/server/db/schema';
import type { MediaType } from '$lib/server/db/schema';
import { getShowProgress } from './show-progress';

export const browseSortValues = ['title', 'year', 'added', 'artist'] as const;
export type BrowseSort = (typeof browseSortValues)[number];

export function isBrowseSort(value: string | null): value is BrowseSort {
	return !!value && (browseSortValues as readonly string[]).includes(value);
}

export const browseWatchedValues = ['watched', 'unwatched'] as const;
export type BrowseWatched = (typeof browseWatchedValues)[number];

export function isBrowseWatched(value: string | null): value is BrowseWatched {
	return !!value && (browseWatchedValues as readonly string[]).includes(value);
}

export const PAGE_SIZE = 30;

export interface BrowseFilters {
	search: string;
	sort: BrowseSort;
	genres: string[];
	watched: BrowseWatched | null;
	page: number;
}

/**
 * A type-filtered, searchable, sorted, paginated page of the library — the "My
 * Movies"/"My Shows"/"My Music" grid views. `watched` is per-item for the given user,
 * computed from a single follow-up query against the returned page rather than a
 * join, since it only needs to cover the items actually being rendered.
 */
export async function browseMediaByType(type: MediaType, userId: string, filters: BrowseFilters) {
	const { search, sort, genres, watched, page } = filters;

	const conditions = [eq(mediaItems.type, type)];
	if (search) {
		conditions.push(
			or(like(mediaItems.title, `%${search}%`), like(mediaItems.artist, `%${search}%`))!
		);
	}
	if (genres.length > 0) {
		// genres is a JSON-encoded string array (e.g. `["Drama","Thriller"]`) — no separate
		// genre table, so this matches on the literal quoted tag rather than a real join.
		// OR semantics: an item matching any of the selected genres is included.
		const genreConditions = genres.map((genre) => like(mediaItems.genres, `%"${genre}"%`));
		conditions.push(or(...genreConditions)!);
	}

	if (watched && type === 'show') {
		// A show's own watch_history rows aren't real data (see getShowProgress) — filter
		// on actual episode completion instead: "watched" means every episode has been,
		// "unwatched" means none have.
		const candidates = await db
			.select({ id: mediaItems.id })
			.from(mediaItems)
			.where(and(...conditions));
		const progress = await getShowProgress(
			userId,
			candidates.map((c) => c.id)
		);
		const matchIds = candidates
			.map((c) => c.id)
			.filter((id) => {
				const p = progress.get(id)!;
				return watched === 'watched'
					? p.totalEpisodes > 0 && p.watchedEpisodes >= p.totalEpisodes
					: p.watchedEpisodes === 0;
			});
		if (matchIds.length === 0) return { items: [], total: 0, page: 1, totalPages: 1 };
		conditions.push(inArray(mediaItems.id, matchIds));
	} else if (watched) {
		const watchedRows = await db
			.selectDistinct({ id: watchHistory.mediaItemId })
			.from(watchHistory)
			.innerJoin(mediaItems, eq(watchHistory.mediaItemId, mediaItems.id))
			.where(and(eq(watchHistory.userId, userId), eq(mediaItems.type, type)));
		const watchedIds = watchedRows.map((row) => row.id);

		if (watched === 'watched') {
			if (watchedIds.length === 0) return { items: [], total: 0, page: 1, totalPages: 1 };
			conditions.push(inArray(mediaItems.id, watchedIds));
		} else if (watchedIds.length > 0) {
			conditions.push(notInArray(mediaItems.id, watchedIds));
		}
	}

	const where = and(...conditions);

	const orderBy =
		sort === 'year'
			? [desc(mediaItems.year), asc(mediaItems.title)]
			: sort === 'added'
				? [desc(mediaItems.createdAt)]
				: sort === 'artist'
					? [asc(mediaItems.artist), asc(mediaItems.title)]
					: [asc(mediaItems.title)];

	const [{ total }] = await db.select({ total: count() }).from(mediaItems).where(where);
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const safePage = Math.min(Math.max(1, page), totalPages);

	const rows = await db.query.mediaItems.findMany({
		where,
		orderBy,
		limit: PAGE_SIZE,
		offset: (safePage - 1) * PAGE_SIZE
	});

	const itemIds = rows.map((row) => row.id);

	if (type === 'show') {
		const progress = await getShowProgress(userId, itemIds);
		return {
			items: rows.map((row) => {
				const p = progress.get(row.id) ?? { watchedEpisodes: 0, totalEpisodes: 0 };
				return {
					...row,
					watched: p.totalEpisodes > 0 && p.watchedEpisodes >= p.totalEpisodes,
					watchProgress: p.totalEpisodes > 0 ? p.watchedEpisodes / p.totalEpisodes : null
				};
			}),
			total,
			page: safePage,
			totalPages
		};
	}

	const watchedItemRows = itemIds.length
		? await db
				.selectDistinct({ id: watchHistory.mediaItemId })
				.from(watchHistory)
				.where(and(eq(watchHistory.userId, userId), inArray(watchHistory.mediaItemId, itemIds)))
		: [];
	const watchedIdSet = new Set(watchedItemRows.map((row) => row.id));

	return {
		items: rows.map((row) => ({
			...row,
			watched: watchedIdSet.has(row.id),
			watchProgress: null as number | null
		})),
		total,
		page: safePage,
		totalPages
	};
}

/** Distinct genre tags actually present across a media type — used to populate the filter panel. */
export async function listAvailableGenres(type: MediaType): Promise<string[]> {
	const rows = await db
		.selectDistinct({ genres: mediaItems.genres })
		.from(mediaItems)
		.where(and(eq(mediaItems.type, type)));

	const genreSet = new Set<string>();
	for (const row of rows) {
		if (!row.genres) continue;
		try {
			const parsed = JSON.parse(row.genres);
			if (Array.isArray(parsed)) parsed.forEach((g) => typeof g === 'string' && genreSet.add(g));
		} catch {
			// Malformed genres JSON — skip rather than fail the whole filter list.
		}
	}
	return Array.from(genreSet).sort((a, b) => a.localeCompare(b));
}
