import { eq, count } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import type { PlexUser } from '$lib/server/plex/auth';

/**
 * Finds the local account linked to a Plex account, creating one on first login.
 * The very first account created becomes admin; everyone after that is a regular user.
 */
export async function findOrCreateUserFromPlex(plexUser: PlexUser) {
	const plexAccountId = String(plexUser.id);

	const existing = await db.query.users.findFirst({
		where: eq(users.plexAccountId, plexAccountId)
	});
	if (existing) return existing;

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
