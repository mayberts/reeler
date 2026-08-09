import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mediaItems, type MediaType } from '$lib/server/db/schema';
import type { PlexMetadataItem } from '$lib/server/plex/client';

const PLEX_TYPE_TO_MEDIA_TYPE: Partial<Record<string, MediaType>> = {
	movie: 'movie',
	show: 'show',
	episode: 'episode'
};

function extractExternalIds(item: PlexMetadataItem) {
	const ids: { tmdbId?: string; tvdbId?: string } = {};
	for (const guid of item.Guid ?? []) {
		const [source, value] = guid.id.split('://');
		if (source === 'tmdb') ids.tmdbId = value;
		if (source === 'tvdb') ids.tvdbId = value;
	}
	return ids;
}

/**
 * Upserts a media item from a raw Plex metadata blob — library listings, history
 * entries, and webhook payloads all share this shape. Matches on `ratingKey` first,
 * falling back to external ids, so an item created from a history entry is found again
 * later by a library sync (and vice versa) even before either side has both fields.
 *
 * Music (artist/album/track) is out of scope until phase 3 — returns null for those.
 */
export async function upsertMediaItemFromPlex(item: PlexMetadataItem): Promise<string | null> {
	const type = PLEX_TYPE_TO_MEDIA_TYPE[item.type];
	if (!type) return null;

	const { tmdbId, tvdbId } = extractExternalIds(item);

	const existing = await db.query.mediaItems.findFirst({
		where: (fields, { eq, or, and, isNotNull }) =>
			or(
				eq(fields.plexRatingKey, item.ratingKey),
				tmdbId ? and(eq(fields.tmdbId, tmdbId), isNotNull(fields.tmdbId)) : undefined,
				tvdbId ? and(eq(fields.tvdbId, tvdbId), isNotNull(fields.tvdbId)) : undefined
			)
	});

	const values = {
		type,
		title: item.title,
		year: item.year ?? null,
		tmdbId: tmdbId ?? null,
		tvdbId: tvdbId ?? null,
		plexRatingKey: item.ratingKey
	};

	if (existing) {
		await db.update(mediaItems).set(values).where(eq(mediaItems.id, existing.id));
		return existing.id;
	}

	const [created] = await db.insert(mediaItems).values(values).returning();
	return created.id;
}
