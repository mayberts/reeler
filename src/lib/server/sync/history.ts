import { db } from '$lib/server/db';
import { watchHistory } from '$lib/server/db/schema';
import { getWatchHistory } from '$lib/server/plex/client';
import { upsertMediaItemFromPlex } from './media-item';

export interface HistoryBackfillResult {
	entriesSeen: number;
	entriesInserted: number;
}

/**
 * Pulls Plex watch history for one user (filtered by their linked Plex accountId) and
 * upserts it into watch_history. Idempotent on (user, media item, watchedAt), so this
 * is safe to call repeatedly — it's both the initial backfill and the polling backstop
 * that catches anything a missed webhook would otherwise lose.
 */
export async function backfillWatchHistory(
	userId: string,
	plexAccountId: string,
	since?: Date
): Promise<HistoryBackfillResult> {
	const { MediaContainer } = await getWatchHistory({
		accountId: plexAccountId,
		since: since ? Math.floor(since.getTime() / 1000) : undefined
	});

	const entries = MediaContainer.Metadata ?? [];
	let entriesInserted = 0;

	for (const entry of entries) {
		try {
			if (!entry.viewedAt) continue;

			const mediaItemId = await upsertMediaItemFromPlex(entry);
			if (!mediaItemId) continue;

			const watchedAt = new Date(entry.viewedAt * 1000);

			const existing = await db.query.watchHistory.findFirst({
				where: (fields, { eq, and }) =>
					and(
						eq(fields.userId, userId),
						eq(fields.mediaItemId, mediaItemId),
						eq(fields.watchedAt, watchedAt)
					)
			});
			if (existing) continue;

			await db.insert(watchHistory).values({ userId, mediaItemId, watchedAt, source: 'plex' });
			entriesInserted++;
		} catch (err) {
			// One malformed entry shouldn't abort the whole batch — everything before it
			// has already committed, and the backstop reconciliation will retry this one.
			console.error('[sync] failed to process history entry', { ratingKey: entry.ratingKey }, err);
		}
	}

	return { entriesSeen: entries.length, entriesInserted };
}

/** Runs backfill for every local account linked to a Plex Home user. */
export async function backfillAllUsers(since?: Date) {
	const linkedUsers = await db.query.users.findMany({
		where: (fields, { isNotNull }) => isNotNull(fields.plexAccountId)
	});

	const results = [];
	for (const user of linkedUsers) {
		if (!user.plexAccountId) continue;
		const result = await backfillWatchHistory(user.id, user.plexAccountId, since);
		results.push({ userId: user.id, ...result });
	}
	return results;
}
