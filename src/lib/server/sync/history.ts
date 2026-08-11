import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mediaItems, watchHistory } from '$lib/server/db/schema';
import { getWatchHistory, getMetadata, scrobbleMedia } from '$lib/server/plex/client';
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

/**
 * Plex Media Server's convention for its own local accounts table: the server
 * owner/admin is always account id 1. `viewCount`/`lastViewedAt` on a library item
 * (see `applyLibraryViewCounts`) reflect whichever account the sync's single admin
 * token belongs to — the owner — not each individual Plex Home member, so gating on
 * this id is what keeps that data from being misattributed to a different linked user.
 */
const PLEX_OWNER_ACCOUNT_ID = '1';

export interface ViewedLibraryItem {
	mediaItemId: string;
	lastViewedAt: number | null;
}

/**
 * Repairs watched state for the Plex Home owner account from Plex's own permanent
 * per-item `viewCount`, for items that have zero `watch_history` rows despite Plex
 * showing them as watched.
 *
 * `/status/sessions/history/all` (what `backfillWatchHistory` reads) is an event log,
 * and real Plex libraries can have gaps in it that have nothing to do with pagination —
 * a re-match/re-scan can orphan old history rows by giving an item a new internal id,
 * and watches from before scrobble/webhook tracking was ever set up were never logged
 * to begin with. `viewCount` isn't affected by either: Plex maintains it permanently
 * against the item regardless of how it got (re)matched. Only ever adds a row when none
 * already exists for that item — real history-log entries (which carry an accurate
 * watched timestamp) always take precedence and are never duplicated by this.
 */
export async function applyLibraryViewCounts(
	viewedItems: ViewedLibraryItem[]
): Promise<{ inserted: number }> {
	if (viewedItems.length === 0) return { inserted: 0 };

	const owner = await db.query.users.findFirst({
		where: (fields, { eq }) => eq(fields.plexAccountId, PLEX_OWNER_ACCOUNT_ID)
	});
	if (!owner) return { inserted: 0 };

	// A plain `userId` lookup rather than `inArray(mediaItemId, viewedItems.ids)` — a full
	// library's worth of ids in one IN clause risks tripping SQLite's bound-variable cap,
	// and this is no more expensive (indexed on `user_id`) while working at any scale.
	const alreadyWatchedRows = await db
		.selectDistinct({ mediaItemId: watchHistory.mediaItemId })
		.from(watchHistory)
		.where(eq(watchHistory.userId, owner.id));
	const alreadyWatchedIds = new Set(alreadyWatchedRows.map((row) => row.mediaItemId));

	let inserted = 0;
	for (const item of viewedItems) {
		if (alreadyWatchedIds.has(item.mediaItemId)) continue;
		await db.insert(watchHistory).values({
			userId: owner.id,
			mediaItemId: item.mediaItemId,
			watchedAt: item.lastViewedAt ? new Date(item.lastViewedAt * 1000) : new Date(),
			source: 'plex'
		});
		inserted++;
	}

	return { inserted };
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

export interface HistoryPushResult {
	itemsScanned: number;
	itemsPushed: number;
	itemsSkipped: number;
}

/**
 * The opposite direction from `backfillWatchHistory`/`backfillAllUsers`: pushes the
 * Plex owner's own watch history from Reeler back to Plex, for recovering from a
 * Plex-side history loss (a database reset, a re-added library, etc.) using Reeler as
 * the source of truth instead.
 *
 * Only the owner account (see `PLEX_OWNER_ACCOUNT_ID`) can be restored this way —
 * scrobbling always acts as whichever Plex account the single configured admin token
 * belongs to, so there's no way to push a non-owner Home member's history back with
 * the current one-token setup. Only items with a `plexRatingKey` are eligible
 * (manually-logged items were never in Plex to begin with), and only ones Plex doesn't
 * already show as watched — both to skip a wasted request and, more importantly, to
 * never clobber a real Plex-side watched date with "now" (`scrobbleMedia` has no way
 * to set a historical timestamp — see its docstring).
 */
export async function pushHistoryToPlex(): Promise<HistoryPushResult> {
	const owner = await db.query.users.findFirst({
		where: (fields, { eq }) => eq(fields.plexAccountId, PLEX_OWNER_ACCOUNT_ID)
	});
	if (!owner) return { itemsScanned: 0, itemsPushed: 0, itemsSkipped: 0 };

	const watchedRows = await db
		.selectDistinct({ mediaItemId: watchHistory.mediaItemId })
		.from(watchHistory)
		.where(eq(watchHistory.userId, owner.id));
	const itemIds = watchedRows.map((row) => row.mediaItemId);
	if (itemIds.length === 0) return { itemsScanned: 0, itemsPushed: 0, itemsSkipped: 0 };

	const items = await db.query.mediaItems.findMany({
		where: and(inArray(mediaItems.id, itemIds), isNotNull(mediaItems.plexRatingKey))
	});

	let itemsPushed = 0;
	let itemsSkipped = 0;

	for (const item of items) {
		if (!item.plexRatingKey) continue;
		try {
			const { MediaContainer } = await getMetadata(item.plexRatingKey);
			const current = MediaContainer.Metadata?.[0];
			if (current?.viewCount && current.viewCount > 0) {
				itemsSkipped++;
				continue;
			}
			await scrobbleMedia(item.plexRatingKey);
			itemsPushed++;
		} catch (err) {
			console.error('[sync] failed to push watch history to Plex', { id: item.id }, err);
			itemsSkipped++;
		}
	}

	return { itemsScanned: items.length, itemsPushed, itemsSkipped };
}
