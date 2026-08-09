import { error, json } from '@sveltejs/kit';
import { checkPin, getPlexUser } from '$lib/server/plex/auth';
import { findOrCreateUserFromPlex } from '$lib/server/auth/user';
import { createSession, setSessionCookie } from '$lib/server/auth/session';
import type { RequestHandler } from './$types';

/**
 * Polled by the login page until the user has approved the pin at plex.tv.
 * Everything here is wrapped in one try/catch — the whole point of `{ status: 'error' }`
 * is to surface any failure to the polling client instead of it silently retrying
 * forever against a broken endpoint (which is exactly what an uncaught exception here
 * used to cause: the client only recognizes 'complete' or 'error', so anything else,
 * including a raw 500, was treated as "keep polling").
 */
export const GET: RequestHandler = async ({ url, cookies }) => {
	const pinId = Number(url.searchParams.get('pin'));
	if (!pinId) error(400, 'Missing pin');

	try {
		const pin = await checkPin(pinId);
		if (!pin.authToken) return json({ status: 'pending' });

		const plexUser = await getPlexUser(pin.authToken);
		const user = await findOrCreateUserFromPlex(plexUser);
		const session = await createSession(user.id);
		setSessionCookie(cookies, session.id, session.expiresAt, url.protocol === 'https:');

		return json({ status: 'complete' });
	} catch (err) {
		console.error('[login] failed to complete Plex sign-in', err);
		return json({ status: 'error' });
	}
};
