import { error, fail } from '@sveltejs/kit';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mediaItems, watchHistory, ratings } from '$lib/server/db/schema';
import { setRating } from '$lib/server/ratings';
import { addListItem, getVisibleLists } from '$lib/server/lists';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Not authenticated');
	const userId = locals.user.id;

	const item = await db.query.mediaItems.findFirst({ where: eq(mediaItems.id, params.id) });
	if (!item) error(404, 'Not found');

	const [[{ watchCount }], lastWatch, rating, visibleLists, parent, seasons] = await Promise.all([
		db
			.select({ watchCount: count() })
			.from(watchHistory)
			.where(and(eq(watchHistory.userId, userId), eq(watchHistory.mediaItemId, item.id))),
		db.query.watchHistory.findFirst({
			where: and(eq(watchHistory.userId, userId), eq(watchHistory.mediaItemId, item.id)),
			orderBy: desc(watchHistory.watchedAt)
		}),
		db.query.ratings.findFirst({
			where: and(eq(ratings.userId, userId), eq(ratings.mediaItemId, item.id))
		}),
		getVisibleLists(userId),
		item.parentId
			? db.query.mediaItems.findFirst({ where: eq(mediaItems.id, item.parentId) })
			: Promise.resolve(null),
		item.type === 'show'
			? db.query.mediaItems.findMany({
					where: and(eq(mediaItems.parentId, item.id), eq(mediaItems.type, 'season')),
					orderBy: asc(mediaItems.seasonNumber)
				})
			: Promise.resolve([])
	]);

	return {
		item,
		parent,
		seasons,
		watchCount,
		lastWatchedAt: lastWatch?.watchedAt ?? null,
		myRating: rating?.value ?? null,
		// Only lists this user owns can be added to.
		myLists: visibleLists.filter((list) => list.ownerId === userId)
	};
};

export const actions: Actions = {
	markWatched: async ({ locals, params }) => {
		if (!locals.user) return fail(401);

		await db.insert(watchHistory).values({
			userId: locals.user.id,
			mediaItemId: params.id,
			watchedAt: new Date(),
			source: 'manual'
		});

		return { watchedSuccess: true };
	},

	rate: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401);

		const form = await request.formData();
		const value = Number(form.get('value'));
		if (!Number.isInteger(value) || value < 0 || value > 10) {
			return fail(400, { message: 'Rating must be a whole number between 0 and 10' });
		}

		try {
			await setRating(locals.user.id, params.id, value);
		} catch (err) {
			console.error('[media] failed to set rating', err);
			return fail(500, { message: 'Failed to save rating' });
		}

		return { ratedSuccess: true };
	},

	addToList: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401);

		const form = await request.formData();
		const listId = form.get('listId');
		if (typeof listId !== 'string' || !listId) {
			return fail(400, { message: 'Choose a list' });
		}

		try {
			await addListItem(listId, locals.user.id, params.id);
		} catch (err) {
			console.error('[media] failed to add to list', err);
			return fail(400, { message: 'Could not add to that list' });
		}

		return { addedSuccess: true };
	}
};
