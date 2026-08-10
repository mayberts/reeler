import { error, json } from '@sveltejs/kit';
import { and, count, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { watchHistory } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/**
 * Logs a manual watch for the current user — the JSON-API twin of the detail page's
 * `markWatched` form action, used by the persistent card action bar so a grid card can
 * log a watch without navigating to the detail page. Same one-way semantics as the
 * detail page: this appends a `watch_history` row, it doesn't toggle one off, since
 * Reeler's history is an append-only log (mirroring Plex's own scrobble history), not
 * a boolean "watched" flag.
 */
export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Not authenticated');

	await db.insert(watchHistory).values({
		userId: locals.user.id,
		mediaItemId: params.id,
		watchedAt: new Date(),
		source: 'manual'
	});

	const [{ watchCount }] = await db
		.select({ watchCount: count() })
		.from(watchHistory)
		.where(and(eq(watchHistory.userId, locals.user.id), eq(watchHistory.mediaItemId, params.id)));

	return json({ watchCount });
};
