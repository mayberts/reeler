import { and, asc, count, desc, eq, inArray, like } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mediaItems, watchHistory } from '$lib/server/db/schema';
import type { MediaType } from '$lib/server/db/schema';

export const browseSortValues = ['title', 'year', 'added'] as const;
export type BrowseSort = (typeof browseSortValues)[number];

export function isBrowseSort(value: string | null): value is BrowseSort {
	return !!value && (browseSortValues as readonly string[]).includes(value);
}

/**
 * A type-filtered, searchable, sorted page of the library — the "My Movies"/"My Shows"/
 * "My Music" grid views. `watched` is per-item for the given user, computed from a single
 * follow-up query against the returned page rather than a join, since it only needs to
 * cover the items actually being rendered.
 */
export async function browseMediaByType(
	type: MediaType,
	userId: string,
	{ search, sort }: { search: string; sort: BrowseSort }
) {
	const where = search
		? and(eq(mediaItems.type, type), like(mediaItems.title, `%${search}%`))
		: eq(mediaItems.type, type);

	const orderBy =
		sort === 'year'
			? [desc(mediaItems.year), asc(mediaItems.title)]
			: sort === 'added'
				? [desc(mediaItems.createdAt)]
				: [asc(mediaItems.title)];

	const [rows, [{ total }]] = await Promise.all([
		db.query.mediaItems.findMany({ where, orderBy }),
		db.select({ total: count() }).from(mediaItems).where(where)
	]);

	const itemIds = rows.map((row) => row.id);
	const watchedRows = itemIds.length
		? await db
				.selectDistinct({ id: watchHistory.mediaItemId })
				.from(watchHistory)
				.where(and(eq(watchHistory.userId, userId), inArray(watchHistory.mediaItemId, itemIds)))
		: [];
	const watchedIds = new Set(watchedRows.map((row) => row.id));

	return {
		items: rows.map((row) => ({ ...row, watched: watchedIds.has(row.id) })),
		total
	};
}
