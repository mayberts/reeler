import { redirect, type Handle } from '@sveltejs/kit';
import { getSessionUser, SESSION_COOKIE_NAME } from '$lib/server/auth/session';
import { startBackgroundSync } from '$lib/server/sync/scheduler';

const PUBLIC_PATH_PREFIXES = ['/login', '/api/webhooks/', '/api/auth/'];

// Runs once when this module is first loaded, i.e. once per server process.
startBackgroundSync();

export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get(SESSION_COOKIE_NAME);
	event.locals.user = sessionId ? await getSessionUser(sessionId) : null;

	// Temporary diagnostic: confirms whether the session cookie is even arriving on
	// this request, and whether it resolved to a user, without logging the cookie
	// value itself.
	if (!event.url.pathname.startsWith('/_app/') && !event.url.pathname.includes('.')) {
		console.log('[hooks] request', {
			path: event.url.pathname,
			hasCookie: !!sessionId,
			resolvedUser: event.locals.user?.username ?? null
		});
	}

	const isPublic = PUBLIC_PATH_PREFIXES.some((prefix) => event.url.pathname.startsWith(prefix));

	if (!event.locals.user && !isPublic) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(event.url.pathname)}`);
	}

	return resolve(event);
};
