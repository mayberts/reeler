import { db } from '$lib/server/db';
import { watchHistory } from '$lib/server/db/schema';
import { getWatchHistory } from '$lib/server/plex/client';
import { upsertMediaItemFromPlex } from './media-item';

export interface HistoryBackfillResult {
	entriesSeen: number;
	entriesInserted: number;
}

const HISTORY_PAGE_SIZE = 200;

/**
 * Pulls Plex watch history for one user (filtered by their linked Plex accountId) and
 * upserts it into watch_history. Idempotent on (user, media item, watchedAt), so this
 * is safe to call repeatedly — it's both the initial backfill and the polling backstop
 * that catches anything a missed webhook would otherwise lose.
 *
 * Pages through the full result set — `/status/sessions/history/all` is a capped
 * recent-activity feed, not a full-dump endpoint like the library sync calls, so a
 * single unpaginated request only returns the most recent page and silently drops
 * everything older. Keeps requesting pages until Plex returns fewer than a full page.
 */
export async function backfillWatchHistory(
	userId: string,
	plexAccountId: string,
	since?: Date
): Promise<HistoryBackfillResult> {
	const sinceSeconds = since ? Math.floor(since.getTime() / 1000) : undefined;
	let entriesSeen = 0;
	let entriesInserted = 0;
	let containerStart = 0;

	for (;;) {
		const { MediaContainer } = await getWatchHistory({
			accountId: plexAccountId,
			since: sinceSeconds,
			containerStart,
			containerSize: HISTORY_PAGE_SIZE
		});

		const entries = MediaContainer.Metadata ?? [];
		entriesSeen += entries.length;

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
				console.error(
					'[sync] failed to process history entry',
					{ ratingKey: entry.ratingKey },
					err
				);
			}
		}

		if (entries.length < HISTORY_PAGE_SIZE) break;
		containerStart += entries.length;
	}

	return { entriesSeen, entriesInserted };
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
