import { listLibrarySections, listSectionItems } from '$lib/server/plex/client';
import { upsertMediaItemFromPlex } from './media-item';

export interface LibrarySyncResult {
	sectionsScanned: number;
	itemsUpserted: number;
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
		// and episodes need their own pass each, since Plex only returns them with an
		// explicit type filter, same as albums. Seasons before episodes means an episode's
		// `parentRatingKey` always resolves to an already-upserted season, not a stub.
		if (section.type === 'show') {
			await upsertAll(await listSectionItems(section.key, { type: '3' }));
			await upsertAll(await listSectionItems(section.key, { type: '4' }));
		}
	}

	return { sectionsScanned: sections.length, itemsUpserted };
}
