import { json } from '@sveltejs/kit';
import { createPin, buildAuthUrl } from '$lib/server/plex/auth';
import { getPlexConfig } from '$lib/server/plex/config';
import type { RequestHandler } from './$types';

/** Creates a Plex OAuth pin. The client opens the returned URL in a new tab, then polls `/api/auth/plex/poll`. */
export const POST: RequestHandler = async () => {
	try {
		const pin = await createPin();
		const authUrl = buildAuthUrl(pin);
		// Temporary diagnostic, pairs with the log in /api/auth/plex/poll. Logging the
		// client identifier's length/JSON-escaped form to catch stray whitespace or
		// hidden characters (e.g. a trailing \r from a Windows-edited .env file) that
		// wouldn't be visible just eyeballing the .env tab.
		const { clientIdentifier } = getPlexConfig();
		console.log('[login] created pin', {
			pinId: pin.id,
			code: pin.code,
			authUrl,
			clientIdentifier: JSON.stringify(clientIdentifier),
			clientIdentifierLength: clientIdentifier.length
		});
		return json({ id: pin.id, authUrl });
	} catch (err) {
		console.error('[login] failed to create Plex pin', err);
		return json({ error: 'plex_unreachable' }, { status: 502 });
	}
};
