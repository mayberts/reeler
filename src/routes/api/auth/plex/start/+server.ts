import { json } from '@sveltejs/kit';
import { createPin, buildAuthUrl } from '$lib/server/plex/auth';
import type { RequestHandler } from './$types';

/** Creates a Plex OAuth pin. The client opens the returned URL in a new tab, then polls `/api/auth/plex/poll`. */
export const POST: RequestHandler = async () => {
	try {
		const pin = await createPin();
		return json({ id: pin.id, authUrl: buildAuthUrl(pin) });
	} catch (err) {
		console.error('[login] failed to create Plex pin', err);
		return json({ error: 'plex_unreachable' }, { status: 502 });
	}
};
