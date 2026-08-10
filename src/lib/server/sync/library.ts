import { sqliteClient } from '$lib/server/db';
import {
	listLibrarySections,
	listSectionItems,
	type PlexMetadataItem
} from '$lib/server/plex/client';
import { upsertMediaItemFromPlex } from './media-item';
import { applyLibraryViewCounts, type ViewedLibraryItem } from './history';

export interface LibrarySyncResult {
	sectionsScanned: number;
	itemsUpserted: number;
	watchedFromViewCount: number;
}

/**
 * Pulls every movie/show/music library section and upserts its top-level items:
 * movies, shows, albums — and, for shows, every season *and* episode too. Tracks are
 * the one thing that stays lazy (created from watch history/webhooks, the same way
 * episodes used to be): a music library's track list is huge relative to what's
 * actually worth mirroring, but a show's own seasons/episodes are exactly what a
 * "seasons" browsing view needs to show without waiting for anything to be watched
 * first — same reasoning that already applied to albums, just one level deeper.
 *
 * Artist-type sections return artists as their direct children, not albums — `type:
 * '9'` asks Plex for a flattened list of every album in the section instead, the same
 * trick `type: '3'`/`type: '4'` do for seasons/episodes (vs. shows) under a show
 * section.
 *
 * No pagination handling yet — fine for typical library sizes, worth revisiting if a
 * single section (now including every episode of every show) exceeds Plex's default
 * response container size.
 *
 * Two phases, deliberately kept separate: first every Plex HTTP request (fast, but a
 * lot of round-trips for a full episode listing), then every DB write, wrapped in one
 * transaction. Interleaving fetch-then-write-then-fetch-then-write per item — the
 * previous shape of this function — meant each write ran in its own implicit
 * transaction (a full disk sync per row); batching them into one commit is dramatically
 * faster on any library big enough to notice, without holding a transaction open across
 * a slow network call.
 *
 * Also repairs the Plex Home owner's watched state from each item's `viewCount` (see
 * `applyLibraryViewCounts`) using the same listing data — no extra Plex requests. This
 * is why library sync (not just history backfill) matters for watched-status accuracy:
 * an item's `viewCount` can be correct here even when `/status/sessions/history/all`
 * has no matching event for it.
 */
export async function syncLibrary(): Promise<LibrarySyncResult> {
	const { MediaContainer } = await listLibrarySections();
	const sections = (MediaContainer.Directory ?? []).filter(
		(section) => section.type === 'movie' || section.type === 'show' || section.type === 'artist'
	);

	// Fetch phase.
	const allItems: PlexMetadataItem[] = [];
	for (const section of sections) {
		const params: Record<string, string> = section.type === 'artist' ? { type: '9' } : {};
		const { MediaContainer: top } = await listSectionItems(section.key, params);
		allItems.push(...(top.Metadata ?? []));

		// Shows are fetched above (via the empty-params, top-level-item request); seasons
		// and episodes need their own request each, since Plex only returns them with an
		// explicit type filter, same as albums. Seasons before episodes means an episode's
		// `parentRatingKey` always resolves to an already-upserted season, not a stub.
		if (section.type === 'show') {
			const { MediaContainer: seasons } = await listSectionItems(section.key, { type: '3' });
			allItems.push(...(seasons.Metadata ?? []));
			const { MediaContainer: episodes } = await listSectionItems(section.key, { type: '4' });
			allItems.push(...(episodes.Metadata ?? []));
		}
	}

	// Write phase — one transaction for the whole batch. `db.transaction()` isn't used
	// here since better-sqlite3 requires its callback to be fully synchronous (throws if
	// it returns a promise), which an async upsert loop can't be; raw BEGIN/COMMIT has no
	// such restriction and produces the identical commit-boundary behavior.
	let itemsUpserted = 0;
	const viewedItems: ViewedLibraryItem[] = [];
	sqliteClient.exec('BEGIN');
	try {
		for (const item of allItems) {
			try {
				const id = await upsertMediaItemFromPlex(item);
				if (id) {
					itemsUpserted++;
					if (item.viewCount && item.viewCount > 0) {
						viewedItems.push({ mediaItemId: id, lastViewedAt: item.lastViewedAt ?? null });
					}
				}
			} catch (err) {
				// One malformed item shouldn't abort the whole sync.
				console.error('[sync] failed to upsert library item', { ratingKey: item.ratingKey }, err);
			}
		}
		sqliteClient.exec('COMMIT');
	} catch (err) {
		sqliteClient.exec('ROLLBACK');
		throw err;
	}

	const { inserted: watchedFromViewCount } = await applyLibraryViewCounts(viewedItems);

	return { sectionsScanned: sections.length, itemsUpserted, watchedFromViewCount };
}
