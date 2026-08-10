import { error, json } from '@sveltejs/kit';
import { verifyPlexConnection } from '$lib/server/plex/client';
import type { RequestHandler } from './$types';

/** Settings page test button: validates a Plex server URL + token pair without saving. */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Not authenticated');
	if (!locals.user.isAdmin) error(403, 'Admin access required');

	const body = await request.json().catch(() => null);
	const serverUrl = typeof body?.serverUrl === 'string' ? body.serverUrl.trim() : '';
	const token = typeof body?.token === 'string' ? body.token.trim() : '';

	if (!serverUrl || !token) {
		return json({ ok: false, message: 'Server URL and token are both required.' });
	}

	const ok = await verifyPlexConnection(serverUrl, token);
	return json({
		ok,
		message: ok ? 'Connected.' : 'Could not connect with this server URL and token.'
	});
};
