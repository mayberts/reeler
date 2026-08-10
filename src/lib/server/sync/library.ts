import { listLibrarySections, listSectionItems } from '$lib/server/plex/client';
import { upsertMediaItemFromPlex } from './media-item';

export interface LibrarySyncResult {
	sectionsScanned: number;
	itemsUpserted: number;
}

/**
 * Pulls every movie/show/music library section and upserts its top-level items:
 * movies, shows, albums — and, for shows, every season too (unlike episodes and
 * tracks, which stay lazy: an episode/track list is huge and "tracking" is about
 * what's actually been watched/listened to, but a show's *seasons* are few enough,
 * and useful enough to browse before anything's been watched, to pre-sync like the
 * show itself).
 *
 * Artist-type sections return artists as their direct children, not albums — `type:
 * '9'` asks Plex for a flattened list of every album in the section instead, the same
 * trick `type: '3'` does for seasons (vs. shows) under a show section, and `type: '4'`
 * would do for episodes.
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
	const upsertAll = async (items: Awaited<ReturnType<typeof listSectionItems>>) => {
		for (const item of items.MediaContainer.Metadata ?? []) {
			try {
				const id = await upsertMediaItemFromPlex(item);
				if (id) itemsUpserted++;
			} catch (err) {
				// One malformed item shouldn't abort the whole section/sync.
				console.error('[sync] failed to upsert library item', { ratingKey: item.ratingKey }, err);
			}
		}
	};

	for (const section of sections) {
		const params: Record<string, string> = section.type === 'artist' ? { type: '9' } : {};
		await upsertAll(await listSectionItems(section.key, params));

		// Shows are upserted above (via the empty-params, top-level-item request); seasons
		// need their own pass since Plex only returns them with an explicit type filter,
		// same as albums. Doing this after the shows pass means a season's `parentRatingKey`
		// always resolves to an already-upserted show, not a stub.
		if (section.type === 'show') {
			await upsertAll(await listSectionItems(section.key, { type: '3' }));
		}
	}

	return { sectionsScanned: sections.length, itemsUpserted };
}
