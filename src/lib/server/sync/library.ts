import { listLibrarySections, listSectionItems } from '$lib/server/plex/client';
import { upsertMediaItemFromPlex } from './media-item';

export interface LibrarySyncResult {
	sectionsScanned: number;
	itemsUpserted: number;
}

/**
 * Pulls every movie/show library section and upserts its top-level items (movies,
 * shows — not individual episodes, which get created lazily from watch history
 * instead). Music sections are skipped until phase 3.
 *
 * No pagination handling yet — fine for typical library sizes, worth revisiting if a
 * single section exceeds Plex's default response container size.
 */
export async function syncLibrary(): Promise<LibrarySyncResult> {
	const { MediaContainer } = await listLibrarySections();
	const sections = (MediaContainer.Directory ?? []).filter(
		(section) => section.type === 'movie' || section.type === 'show'
	);

	let itemsUpserted = 0;
	for (const section of sections) {
		const { MediaContainer: items } = await listSectionItems(section.key);
		for (const item of items.Metadata ?? []) {
			const id = await upsertMediaItemFromPlex(item);
			if (id) itemsUpserted++;
		}
	}

	return { sectionsScanned: sections.length, itemsUpserted };
}
