import { error, json } from '@sveltejs/kit';
import { checkPin, getPlexUser } from '$lib/server/plex/auth';
import { findOrCreateUserFromPlex } from '$lib/server/auth/user';
import { createSession, setSessionCookie, SESSION_COOKIE_NAME } from '$lib/server/auth/session';
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
		// Temporary diagnostic: never logs the token itself, just whether Plex has
		// attached one to this pin yet.
		console.log('[login] poll', { pinId, code: pin.code, hasAuthToken: !!pin.authToken });
		if (!pin.authToken) return json({ status: 'pending' });

		const plexUser = await getPlexUser(pin.authToken);
		const user = await findOrCreateUserFromPlex(plexUser);
		const session = await createSession(user.id);
		const secure = url.protocol === 'https:';
		setSessionCookie(cookies, session.id, session.expiresAt, secure);
		// Temporary diagnostic: confirms cookies.set() actually registered the cookie
		// (readBack) and shows exactly what attributes it used, without needing to hunt
		// through DevTools across multiple attempts to find the right request.
		console.log('[login] session cookie set', {
			protocol: url.protocol,
			secure,
			expiresAt: session.expiresAt,
			expiresAtValid: !Number.isNaN(session.expiresAt?.getTime()),
			readBack: cookies.get(SESSION_COOKIE_NAME)
		});

		return json({ status: 'complete' });
	} catch (err) {
		console.error('[login] failed to complete Plex sign-in', err);
		return json({ status: 'error' });
	}
};
