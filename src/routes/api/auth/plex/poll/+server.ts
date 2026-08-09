import { error, json } from '@sveltejs/kit';
import { checkPin, getPlexUser } from '$lib/server/plex/auth';
import { findOrCreateUserFromPlex } from '$lib/server/auth/user';
import { createSession, setSessionCookie } from '$lib/server/auth/session';
import type { RequestHandler } from './$types';

/** Polled by the login page until the user has approved the pin at plex.tv. */
export const GET: RequestHandler = async ({ url, cookies }) => {
	const pinId = Number(url.searchParams.get('pin'));
	if (!pinId) error(400, 'Missing pin');

	let pin;
	try {
		pin = await checkPin(pinId);
	} catch (err) {
		console.error('[login] failed to check Plex pin', err);
		return json({ status: 'error' });
	}

	if (!pin.authToken) return json({ status: 'pending' });

	const plexUser = await getPlexUser(pin.authToken);
	const user = await findOrCreateUserFromPlex(plexUser);
	const session = await createSession(user.id);
	setSessionCookie(cookies, session.id, session.expiresAt, url.protocol === 'https:');

	return json({ status: 'complete' });
};
