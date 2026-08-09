import { eq, count } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { listServerAccounts } from '$lib/server/plex/client';
import type { PlexUser } from '$lib/server/plex/auth';

/**
 * Resolves the Plex Media Server's own local account id for this user by matching
 * username against /accounts — that's the id watch history and webhooks actually use,
 * not plex.tv's global account id. Falls back to the global id (won't match anything
 * in history/webhooks, but keeps sign-in working) if the PMS can't be reached or this
 * user hasn't connected to it yet.
 */
async function resolveServerAccountId(plexUser: PlexUser): Promise<string> {
	try {
		const { MediaContainer } = await listServerAccounts();
		const match = (MediaContainer.Account ?? []).find(
			(account) => account.name === plexUser.username
		);
		if (match) return String(match.id);
	} catch (err) {
		console.error('[auth] failed to resolve Plex server-local account id', err);
	}
	return String(plexUser.id);
}

/**
 * Finds the local account linked to a Plex account, creating one on first login.
 * The very first account created becomes admin; everyone after that is a regular user.
 */
export async function findOrCreateUserFromPlex(plexUser: PlexUser) {
	const plexAccountId = await resolveServerAccountId(plexUser);

	const existingById = await db.query.users.findFirst({
		where: eq(users.plexAccountId, plexAccountId)
	});
	if (existingById) return existingById;

	// Migrates an account created before server-local id resolution existed (or before
	// this user had ever connected to the PMS) onto the correct id, in place.
	const existingByUsername = await db.query.users.findFirst({
		where: eq(users.username, plexUser.username)
	});
	if (existingByUsername) {
		const [updated] = await db
			.update(users)
			.set({ plexAccountId })
			.where(eq(users.id, existingByUsername.id))
			.returning();
		return updated;
	}

	const [{ value: existingUserCount }] = await db.select({ value: count() }).from(users);

	const [created] = await db
		.insert(users)
		.values({
			username: plexUser.username,
			plexAccountId,
			isAdmin: existingUserCount === 0
		})
		.returning();

	return created;
}
