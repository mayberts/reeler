import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mediaItems, type MediaType } from '$lib/server/db/schema';
import { getMetadata, type PlexMetadataItem } from '$lib/server/plex/client';

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
 * Plex's history entries and webhook payloads for music are much sparser than for
 * movies/shows/episodes: a real track entry looks like `{ title, ratingKey, type,
 * parentTitle, grandparentTitle, viewedAt, ... }` — `parentTitle` (the album name) is
 * there as plain text, but `parentRatingKey` (the album's own ratingKey) never is.
 * Without it there's no way to link a track to its album, so a sparse track/album item
 * (no `thumb`, used as the signal it wasn't a full lookup) gets enriched from the
 * canonical `/library/metadata/{ratingKey}` before proceeding.
 */
async function enrichSparseMusicItem(item: PlexMetadataItem): Promise<PlexMetadataItem> {
	if (item.type !== 'track' && item.type !== 'album') return item;
	if (item.thumb || !item.ratingKey) return item;

	try {
		const { MediaContainer } = await getMetadata(item.ratingKey);
		const full = MediaContainer.Metadata?.[0];
		return full ? { ...item, ...full } : item;
	} catch (err) {
		console.error(
			'[sync] failed to fetch full metadata for sparse music item',
			{ ratingKey: item.ratingKey },
			err
		);
		return item;
	}
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
export async function upsertMediaItemFromPlex(rawItem: PlexMetadataItem): Promise<string | null> {
	const type = PLEX_TYPE_TO_MEDIA_TYPE[rawItem.type];
	// Plex's history endpoint can return stub/orphaned entries (e.g. for a show that's
	// since been removed from the library) missing fields a normal item always has —
	// skip rather than let a NOT NULL constraint blow up the whole sync batch.
	if (!type || !rawItem.title || !rawItem.ratingKey) return null;

	const item = await enrichSparseMusicItem(rawItem);

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
		// Not every payload carries these fields even after enrichment (e.g. a movie/show
		// history entry that predates this schema) — fall back to whatever's already
		// stored rather than clobbering known data with null.
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

/**
 * One-time (but idempotent, safe to run repeatedly) repair for tracks that were
 * created before `enrichSparseMusicItem` existed — they have a real `plexRatingKey`
 * but no `parentId`, since the sparse payload they were created from never carried
 * `parentRatingKey`. Re-running each through `upsertMediaItemFromPlex` with just its
 * ratingKey triggers the same enrichment fetch a fresh sync would, filling in the
 * album link (and thumb/duration/genre) from Plex's canonical metadata.
 */
export async function repairOrphanedTrackParents(): Promise<{ scanned: number; fixed: number }> {
	const orphans = await db.query.mediaItems.findMany({
		where: (fields, { eq, and, isNull }) => and(eq(fields.type, 'track'), isNull(fields.parentId))
	});

	let fixed = 0;
	for (const track of orphans) {
		if (!track.plexRatingKey) continue;
		try {
			const mediaItemId = await upsertMediaItemFromPlex({
				ratingKey: track.plexRatingKey,
				title: track.title,
				type: 'track'
			});
			if (!mediaItemId) continue;
			const updated = await db.query.mediaItems.findFirst({
				where: eq(mediaItems.id, mediaItemId)
			});
			if (updated?.parentId) fixed++;
		} catch (err) {
			console.error('[sync] failed to repair orphaned track', { id: track.id }, err);
		}
	}

	return { scanned: orphans.length, fixed };
}
