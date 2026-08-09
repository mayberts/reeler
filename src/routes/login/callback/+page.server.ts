import { redirect } from '@sveltejs/kit';
import { checkPin, getPlexUser, type PlexPin } from '$lib/server/plex/auth';
import { findOrCreateUserFromPlex } from '$lib/server/auth/user';
import { createSession, setSessionCookie } from '$lib/server/auth/session';
import { PIN_COOKIE_NAME } from '$lib/server/auth/plex-pin';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, url }) => {
	const pinId = cookies.get(PIN_COOKIE_NAME);
	cookies.delete(PIN_COOKIE_NAME, { path: '/' });

	if (!pinId) redirect(303, '/login?error=missing_pin');

	let pin: PlexPin;
	try {
		pin = await checkPin(Number(pinId));
	} catch (err) {
		console.error('[login] failed to check Plex pin', err);
		redirect(303, '/login?error=plex_unreachable');
	}

	if (!pin.authToken) redirect(303, '/login?error=not_approved');

	const plexUser = await getPlexUser(pin.authToken);
	const user = await findOrCreateUserFromPlex(plexUser);
	const session = await createSession(user.id);
	setSessionCookie(cookies, session.id, session.expiresAt, url.protocol === 'https:');

	redirect(303, '/');
};
