import { error, json } from '@sveltejs/kit';
import { addListItem } from '$lib/server/lists';
import type { RequestHandler } from './$types';

/**
 * Adds a media item to one of the current user's lists — the JSON-API twin of the
 * detail page's `addToList` form action, used by the persistent card action bar.
 */
export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.user) error(401, 'Not authenticated');

	const body = await request.json().catch(() => null);
	const listId = body?.listId;
	if (typeof listId !== 'string' || !listId) error(400, 'Missing listId');

	try {
		await addListItem(listId, locals.user.id, params.id);
	} catch {
		error(400, 'Could not add to that list');
	}

	return json({ ok: true });
};
