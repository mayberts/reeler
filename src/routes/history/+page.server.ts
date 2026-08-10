import { error, fail } from '@sveltejs/kit';
import { eq, desc, and, or, count } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { watchHistory, mediaItems, ratings, type MediaType } from '$lib/server/db/schema';
import { searchTmdb, getTmdbDetails } from '$lib/server/tmdb/client';
import { getTmdbReadAccessToken } from '$lib/server/tmdb/config';
import { getOwnedLists } from '$lib/server/lists';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 40;
const historyTypeValues = ['movie', 'show', 'music'] as const;
type HistoryTypeFilter = (typeof historyTypeValues)[number];

function isHistoryTypeFilter(value: string | null): value is HistoryTypeFilter {
	return !!value && (historyTypeValues as readonly string[]).includes(value);
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Not authenticated');
	const user = locals.user;

	const typeParam = url.searchParams.get('type');
	const typeFilter = isHistoryTypeFilter(typeParam) ? typeParam : null;
	const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);

	const typeCondition =
		typeFilter === 'movie' || typeFilter === 'show'
			? eq(mediaItems.type, typeFilter)
			: typeFilter === 'music'
				? or(eq(mediaItems.type, 'album'), eq(mediaItems.type, 'track'))
				: undefined;

	const where = typeCondition
		? and(eq(watchHistory.userId, user.id), typeCondition)
		: eq(watchHistory.userId, user.id);

	const [[{ total }], rows, myLists] = await Promise.all([
		db
			.select({ total: count() })
			.from(watchHistory)
			.innerJoin(mediaItems, eq(watchHistory.mediaItemId, mediaItems.id))
			.where(where),
		db
			.select({
				id: watchHistory.id,
				watchedAt: watchHistory.watchedAt,
				source: watchHistory.source,
				mediaItem: mediaItems,
				rating: ratings.value
			})
			.from(watchHistory)
			.innerJoin(mediaItems, eq(watchHistory.mediaItemId, mediaItems.id))
			.leftJoin(ratings, and(eq(ratings.mediaItemId, mediaItems.id), eq(ratings.userId, user.id)))
			.where(where)
			.orderBy(desc(watchHistory.watchedAt))
			.limit(PAGE_SIZE)
			.offset((page - 1) * PAGE_SIZE),
		getOwnedLists(user.id)
	]);

	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	const logQuery = url.searchParams.get('logQuery')?.trim() ?? '';
	const [logResults, tmdbToken] = await Promise.all([
		logQuery ? searchTmdb(logQuery) : Promise.resolve([]),
		getTmdbReadAccessToken()
	]);

	return {
		history: rows,
		total,
		page,
		totalPages,
		typeFilter,
		logQuery,
		logResults,
		tmdbEnabled: tmdbToken !== null,
		myLists
	};
};

export const actions: Actions = {
	logManual: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		const user = locals.user;

		const form = await request.formData();
		const tmdbId = form.get('tmdbId');
		const title = form.get('title');
		const yearRaw = form.get('year');
		const mediaType = form.get('mediaType');
		const watchedAtRaw = form.get('watchedAt');
		const posterUrlRaw = form.get('posterUrl');

		if (
			typeof tmdbId !== 'string' ||
			typeof title !== 'string' ||
			(mediaType !== 'movie' && mediaType !== 'show')
		) {
			return fail(400, { message: 'Missing fields' });
		}

		const year = typeof yearRaw === 'string' && yearRaw ? Number(yearRaw) : null;
		const watchedAt =
			typeof watchedAtRaw === 'string' && watchedAtRaw ? new Date(watchedAtRaw) : new Date();
		const artworkUrl = typeof posterUrlRaw === 'string' && posterUrlRaw ? posterUrlRaw : null;

		let mediaItem = await db.query.mediaItems.findFirst({
			where: eq(mediaItems.tmdbId, tmdbId)
		});

		if (!mediaItem) {
			// Best-effort — a failed detail fetch shouldn't block logging the watch itself,
			// it just means the detail page will be a little sparser for this item.
			let details: Awaited<ReturnType<typeof getTmdbDetails>> = null;
			try {
				details = await getTmdbDetails(tmdbId, mediaType);
			} catch (err) {
				console.error('[history] failed to fetch TMDb details', err);
			}

			const [created] = await db
				.insert(mediaItems)
				.values({
					type: mediaType as MediaType,
					title,
					year,
					tmdbId,
					artworkUrl,
					backdropUrl: details?.backdropUrl ?? null,
					tagline: details?.tagline ?? null,
					summary: details?.summary ?? null,
					runtimeMinutes: details?.runtimeMinutes ?? null,
					genres: details?.genres.length ? JSON.stringify(details.genres) : null
				})
				.returning();
			mediaItem = created;
		}

		await db.insert(watchHistory).values({
			userId: user.id,
			mediaItemId: mediaItem.id,
			watchedAt,
			source: 'manual'
		});

		return { loggedSuccess: true };
	},

	removeEntry: async ({ request, locals }) => {
		if (!locals.user) return fail(401);

		const form = await request.formData();
		const entryId = form.get('entryId');
		if (typeof entryId !== 'string') return fail(400, { message: 'Missing entry' });

		await db
			.delete(watchHistory)
			.where(and(eq(watchHistory.id, entryId), eq(watchHistory.userId, locals.user.id)));

		return { removedSuccess: true };
	}
};
