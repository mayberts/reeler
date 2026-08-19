import { and, asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mediaItems, type MediaItem } from '$lib/server/db/schema';
import { getChildren } from '$lib/server/plex/client';
import { upsertMediaItemFromPlex } from '$lib/server/sync/media-item';

/**
 * An album's full tracklist — every track, not just the ones actually played. Reeler
 * otherwise only ever creates a track row the first time it's played (see
 * `sync/media-item.ts`'s module docstring), so this is a deliberate, narrow exception:
 * fetched and persisted lazily, the first time someone opens the album's own detail
 * page, exactly like `getOrFetchCredits` does for cast/crew — never during library sync
 * or on a schedule.
 *
 * Reuses `upsertMediaItemFromPlex` for each track rather than inserting rows directly,
 * so an already-played track (with its own watch history) is updated in place instead
 * of duplicated, and every other field (duration, thumb-via-parent, etc.) is filled in
 * exactly the way a normal play would fill it in.
 */
export async function getOrFetchAlbumTracklist(album: MediaItem): Promise<MediaItem[] | null> {
	if (album.type !== 'album') return null;

	try {
		const existing = await db.query.mediaItems.findMany({
			where: and(eq(mediaItems.parentId, album.id), eq(mediaItems.type, 'track')),
			orderBy: asc(mediaItems.trackNumber)
		});
		if (album.trackCount && existing.length >= album.trackCount) return existing;

		if (!album.plexRatingKey) return existing;

		const { MediaContainer } = await getChildren(album.plexRatingKey);
		const children = MediaContainer.Metadata ?? [];
		if (children.length === 0) return existing;

		for (const track of children) {
			await upsertMediaItemFromPlex(track);
		}
		await db
			.update(mediaItems)
			.set({ trackCount: children.length })
			.where(eq(mediaItems.id, album.id));

		return db.query.mediaItems.findMany({
			where: and(eq(mediaItems.parentId, album.id), eq(mediaItems.type, 'track')),
			orderBy: asc(mediaItems.trackNumber)
		});
	} catch (err) {
		console.error('[tracklist] failed to load/fetch album tracklist', { albumId: album.id }, err);
		return null;
	}
}
