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
 * `secure` should reflect whether *this request* arrived over HTTPS — not a static
 * dev/prod flag. Reeler is commonly run as plain HTTP with no reverse proxy in front,
 * and a cookie marked Secure is silently dropped by the browser on such a connection.
 */
export function setSessionCookie(
	cookies: Cookies,
	sessionId: string,
	expiresAt: Date,
	secure: boolean
) {
	cookies.set(SESSION_COOKIE_NAME, sessionId, {
		path: '/',
		httpOnly: true,
		secure,
		sameSite: 'lax',
		expires: expiresAt
	});
}

export function clearSessionCookie(cookies: Cookies) {
	cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
}
