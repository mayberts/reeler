import { error, fail } from '@sveltejs/kit';
import { eq, like } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { ratings, mediaItems } from '$lib/server/db/schema';
import { setRating } from '$lib/server/ratings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Not authenticated');
	const user = locals.user;

	const myRatings = await db.query.ratings.findMany({
		where: eq(ratings.userId, user.id),
		orderBy: (fields, { desc }) => desc(fields.updatedAt),
		with: { mediaItem: true }
	});

	const query = url.searchParams.get('q')?.trim() ?? '';
	const searchResults = query
		? await db.query.mediaItems.findMany({
				where: like(mediaItems.title, `%${query}%`),
				orderBy: (fields, { asc }) => asc(fields.title),
				limit: 20
			})
		: [];

	return { ratings: myRatings, query, searchResults };
};

export const actions: Actions = {
	rate: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		const user = locals.user;

		const form = await request.formData();
		const mediaItemId = form.get('mediaItemId');
		const rawValue = form.get('value');

		if (typeof mediaItemId !== 'string' || typeof rawValue !== 'string') {
			return fail(400, { message: 'Missing fields' });
		}

		const value = Number(rawValue);
		if (!Number.isInteger(value) || value < 0 || value > 10) {
			return fail(400, { message: 'Rating must be a whole number between 0 and 10' });
		}

		try {
			await setRating(user.id, mediaItemId, value);
		} catch (err) {
			console.error('[ratings] failed to set rating', err);
			return fail(500, { message: 'Failed to save rating' });
		}

		return { success: true };
	}
};
