import { error, json } from '@sveltejs/kit';
import { verifyTvdbKey } from '$lib/server/tvdb/client';
import type { RequestHandler } from './$types';

/** Settings page test button: validates a TVDB API key without saving. */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Not authenticated');
	if (!locals.user.isAdmin) error(403, 'Admin access required');

	const body = await request.json().catch(() => null);
	const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';

	if (!apiKey) return json({ ok: false, message: 'API key is required.' });

	const ok = await verifyTvdbKey(apiKey);
	return json({ ok, message: ok ? 'Valid key.' : 'This does not look like a valid key.' });
};
