import { eq } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sessions } from '$lib/server/db/schema';

export const SESSION_COOKIE_NAME = 'reeler_session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export async function createSession(userId: string) {
	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
	const [session] = await db.insert(sessions).values({ userId, expiresAt }).returning();
	return session;
}

/** Resolves a session cookie to its user, lazily deleting the session once expired. */
export async function getSessionUser(sessionId: string) {
	const result = await db.query.sessions.findFirst({
		where: eq(sessions.id, sessionId),
		with: { user: true }
	});
	if (!result) return null;

	if (result.expiresAt.getTime() < Date.now()) {
		await db.delete(sessions).where(eq(sessions.id, sessionId));
		return null;
	}

	return result.user;
}

export async function deleteSession(sessionId: string) {
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/**
 * Deliberately never Secure: Reeler doesn't terminate TLS in any deployment this app
 * supports, so the connection is always plain HTTP from Node's point of view. This used
 * to be derived from the request's url.protocol, but that proved unreliable in practice
 * — it reported 'https:' on a connection that was verifiably plain HTTP (confirmed via
 * logging), causing the browser to correctly discard the cookie as insecure. If a
 * TLS-terminating reverse proxy in front of Reeler is ever supported, this should become
 * an explicit opt-in (env var), not inferred from a header.
 */
export function setSessionCookie(cookies: Cookies, sessionId: string, expiresAt: Date) {
	cookies.set(SESSION_COOKIE_NAME, sessionId, {
		path: '/',
		httpOnly: true,
		secure: false,
		sameSite: 'lax',
		expires: expiresAt
	});
}

export function clearSessionCookie(cookies: Cookies) {
	cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
}
