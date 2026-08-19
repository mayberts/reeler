import { error, json } from '@sveltejs/kit';
import { setRating } from '$lib/server/ratings';
import type { RequestHandler } from './$types';

/**
 * Sets the current user's rating on a media item — the JSON-API twin of the detail
 * page's `?/rate` form action, for components that can't use a form action directly
 * (embedded rows like `TrackRow`, the same way `/lists` and `/watch` already serve
 * `EpisodeRow`/`MediaCard`).
 */
export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.user) error(401, 'Not authenticated');

	const body = await request.json().catch(() => null);
	const value = Number(body?.value);
	if (!Number.isInteger(value) || value < 0 || value > 10) {
		error(400, 'Rating must be a whole number between 0 and 10');
	}

	try {
		await setRating(locals.user.id, params.id, value);
	} catch {
		error(400, 'Could not save rating');
	}

	return json({ value });
};
