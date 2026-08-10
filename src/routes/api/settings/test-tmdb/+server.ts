import { error, json } from '@sveltejs/kit';
import { verifyTmdbToken } from '$lib/server/tmdb/client';
import type { RequestHandler } from './$types';

/** Settings page test button: validates a TMDB Read Access Token without saving. */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Not authenticated');
	if (!locals.user.isAdmin) error(403, 'Admin access required');

	const body = await request.json().catch(() => null);
	const token = typeof body?.token === 'string' ? body.token.trim() : '';

	if (!token) return json({ ok: false, message: 'Token is required.' });

	const ok = await verifyTmdbToken(token);
	return json({ ok, message: ok ? 'Valid token.' : 'This does not look like a valid token.' });
};
