import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mediaItems, type MediaType } from '$lib/server/db/schema';
import type { PlexMetadataItem } from '$lib/server/plex/client';

const PLEX_TYPE_TO_MEDIA_TYPE: Partial<Record<string, MediaType>> = {
	movie: 'movie',
	show: 'show',
	episode: 'episode',
	track: 'track',
	album: 'album'
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
 * Music isn't pre-synced from the library like movies/shows — the catalog can be huge
 * and "tracking" is about what's actually been played, not mirroring every track. Album
 * and track items get created lazily here, the same way episodes already are, the first
 * time they show up in watch history or a webhook. Artists aren't modeled as their own
 * row (nothing to "track" about an artist itself); a track's `parentTitle` already
 * carries the artist context via its album.
 */
export async function upsertMediaItemFromPlex(item: PlexMetadataItem): Promise<string | null> {
	const type = PLEX_TYPE_TO_MEDIA_TYPE[item.type];
	// Plex's history endpoint can return stub/orphaned entries (e.g. for a show that's
	// since been removed from the library) missing fields a normal item always has —
	// skip rather than let a NOT NULL constraint blow up the whole sync batch.
	if (!type || !item.title || !item.ratingKey) return null;

	const { tmdbId, tvdbId } = extractExternalIds(item);

	let parentId: string | null = null;
	if (type === 'track' && item.parentRatingKey && item.parentTitle) {
		parentId = await upsertMediaItemFromPlex({
			ratingKey: item.parentRatingKey,
			title: item.parentTitle,
			type: 'album'
		});
	}

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
		plexRatingKey: item.ratingKey,
		parentId,
		// Not every payload carries these fields (e.g. the synthetic album item built above
		// for a track has none of them) — fall back to whatever's already stored rather than
		// clobbering known data with null.
		plexThumb: item.thumb ?? existing?.plexThumb ?? null,
		plexArt: item.art ?? existing?.plexArt ?? null,
		tagline: item.tagline ?? existing?.tagline ?? null,
		summary: item.summary ?? existing?.summary ?? null,
		runtimeMinutes: item.duration
			? Math.round(item.duration / 60000)
			: (existing?.runtimeMinutes ?? null),
		contentRating: item.contentRating ?? existing?.contentRating ?? null,
		genres: item.Genre?.length
			? JSON.stringify(item.Genre.map((g) => g.tag))
			: (existing?.genres ?? null)
	};

	if (existing) {
		await db.update(mediaItems).set(values).where(eq(mediaItems.id, existing.id));
		return existing.id;
	}

	const [created] = await db.insert(mediaItems).values(values).returning();
	return created.id;
}
