import { error, fail } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { watchHistory, mediaItems, type MediaType } from '$lib/server/db/schema';
import { searchTmdb, getTmdbDetails } from '$lib/server/tmdb/client';
import { getTmdbApiKey } from '$lib/server/tmdb/config';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Not authenticated');
	const user = locals.user;

	const history = await db.query.watchHistory.findMany({
		where: eq(watchHistory.userId, user.id),
		orderBy: desc(watchHistory.watchedAt),
		limit: 200,
		with: { mediaItem: true }
	});

	const logQuery = url.searchParams.get('logQuery')?.trim() ?? '';
	const logResults = logQuery ? await searchTmdb(logQuery) : [];

	return { history, logQuery, logResults, tmdbEnabled: getTmdbApiKey() !== null };
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
	}
};
