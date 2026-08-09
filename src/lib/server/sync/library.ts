import { listLibrarySections, listSectionItems } from '$lib/server/plex/client';
import { upsertMediaItemFromPlex } from './media-item';

export interface LibrarySyncResult {
	sectionsScanned: number;
	itemsUpserted: number;
}

/**
 * Pulls every movie/show/music library section and upserts its top-level items:
 * movies, shows, and albums. Episodes and tracks aren't pre-synced — they're created
 * lazily from watch history/webhooks instead, same reasoning for both: a show's
 * episode list and an album's track list aren't worth mirroring up front just to
 * track what's been watched/listened to, but the show and the album themselves are
 * worth browsing even before anything's been played.
 *
 * Artist-type sections return artists as their direct children, not albums — `type:
 * '9'` asks Plex for a flattened list of every album in the section instead (the same
 * trick a `type: '4'` request would do for episodes under a show section).
 *
 * No pagination handling yet — fine for typical library sizes, worth revisiting if a
 * single section exceeds Plex's default response container size.
 */
export async function syncLibrary(): Promise<LibrarySyncResult> {
	const { MediaContainer } = await listLibrarySections();
	const sections = (MediaContainer.Directory ?? []).filter(
		(section) => section.type === 'movie' || section.type === 'show' || section.type === 'artist'
	);

	let itemsUpserted = 0;
	for (const section of sections) {
		const params: Record<string, string> = section.type === 'artist' ? { type: '9' } : {};
		const { MediaContainer: items } = await listSectionItems(section.key, params);
		for (const item of items.Metadata ?? []) {
			try {
				const id = await upsertMediaItemFromPlex(item);
				if (id) itemsUpserted++;
			} catch (err) {
				// One malformed item shouldn't abort the whole section/sync.
				console.error('[sync] failed to upsert library item', { ratingKey: item.ratingKey }, err);
			}
		}
	}

	return { sectionsScanned: sections.length, itemsUpserted };
}
