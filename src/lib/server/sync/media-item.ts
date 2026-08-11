import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mediaItems, type MediaType } from '$lib/server/db/schema';
import { getMetadata, type PlexMetadataItem } from '$lib/server/plex/client';

const PLEX_TYPE_TO_MEDIA_TYPE: Partial<Record<string, MediaType>> = {
	movie: 'movie',
	show: 'show',
	season: 'season',
	episode: 'episode',
	track: 'track',
	album: 'album'
};

/** For a lazily-created child item, which media type its `parentRatingKey` refers to. */
const PARENT_TYPE: Partial<Record<MediaType, MediaType>> = {
	track: 'album',
	episode: 'season',
	season: 'show'
};

function extractExternalIds(item: PlexMetadataItem) {
	const ids: { tmdbId?: string; tvdbId?: string; imdbId?: string } = {};
	for (const guid of item.Guid ?? []) {
		const [source, value] = guid.id.split('://');
		if (source === 'tmdb') ids.tmdbId = value;
		if (source === 'tvdb') ids.tvdbId = value;
		if (source === 'imdb') ids.imdbId = value;
	}
	return ids;
}

/**
 * Plex's history entries and webhook payloads for music/episodes are much sparser than
 * a full library listing: a real track/episode entry looks like `{ title, ratingKey,
 * type, parentTitle, grandparentTitle, viewedAt, ... }` — `parentTitle` (the album/season
 * name) is there as plain text, but `parentRatingKey` (its own ratingKey) never is.
 * Without it there's no way to link the item to its parent, so a sparse item (no
 * `thumb`, used as the signal it wasn't a full lookup) gets enriched from the canonical
 * `/library/metadata/{ratingKey}` before proceeding.
 */
async function enrichSparseItem(item: PlexMetadataItem): Promise<PlexMetadataItem> {
	if (item.type !== 'track' && item.type !== 'album' && item.type !== 'episode') return item;
	if (item.thumb || !item.ratingKey) return item;

	try {
		const { MediaContainer } = await getMetadata(item.ratingKey);
		const full = MediaContainer.Metadata?.[0];
		return full ? { ...item, ...full } : item;
	} catch (err) {
		console.error(
			'[sync] failed to fetch full metadata for sparse item',
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
 * Shows pre-sync their full season and episode lists (see `syncLibrary`), so an
 * episode's season row usually already exists by the time this runs — but music isn't
 * pre-synced from the library like movies/shows/seasons/episodes, since the catalog can
 * be huge and "tracking" is about what's actually been played, not mirroring every
 * track. Album and track items get created lazily here, the first time they show up in
 * watch history or a webhook (this function still handles a lazily-created episode too
 * — a webhook/history entry for a show not yet library-synced, say — the same way it
 * always has). Artists aren't modeled as their own row (nothing to "track" about an
 * artist itself) — an album just carries its artist's name in its own `artist` column,
 * read off Plex's `parentTitle` for the album (see `values` below).
 */
export async function upsertMediaItemFromPlex(rawItem: PlexMetadataItem): Promise<string | null> {
	const type = PLEX_TYPE_TO_MEDIA_TYPE[rawItem.type];
	// Plex's history endpoint can return stub/orphaned entries (e.g. for a show that's
	// since been removed from the library) missing fields a normal item always has —
	// skip rather than let a NOT NULL constraint blow up the whole sync batch.
	if (!type || !rawItem.title || !rawItem.ratingKey) return null;

	const item = await enrichSparseItem(rawItem);

	const { tmdbId, tvdbId, imdbId } = extractExternalIds(item);

	const parentType = PARENT_TYPE[type];
	let parentId: string | null = null;
	// A track's own cover, once the parent album has been upserted above (see
	// `plexThumb` below) — read back from our own DB rather than trusted from Plex's
	// payload directly. An earlier version of this tried Plex's own `parentThumb` field,
	// but that isn't reliably present on real track payloads (sparse history entries or
	// the enriched per-item lookup); the album's own row, upserted just above, always has
	// the right cover already, since that's populated the same way a plain album row is.
	let parentPlexThumb: string | null = null;
	if (parentType && item.parentRatingKey && item.parentTitle) {
		parentId = await upsertMediaItemFromPlex({
			ratingKey: item.parentRatingKey,
			title: item.parentTitle,
			type: parentType,
			// A season stub created here (e.g. from a lazily-created episode that beat the
			// season pre-sync) still carries its own number, so the seasons grid can sort it
			// correctly even before a full library sync fills in the rest.
			index: type === 'episode' ? item.parentIndex : undefined
		});
		if (type === 'track' && parentId) {
			const parent = await db.query.mediaItems.findFirst({
				where: eq(mediaItems.id, parentId),
				columns: { plexThumb: true }
			});
			parentPlexThumb = parent?.plexThumb ?? null;
		}
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
		// An album's own `parentTitle` is its artist (Plex's music hierarchy is
		// Artist -> Album -> Track); tracks/episodes/seasons already use parentTitle for
		// their own parent link above, so this only ever fires for albums.
		artist: (type === 'album' ? item.parentTitle : undefined) ?? existing?.artist ?? null,
		// A season/episode's parent-linking stub call only carries a ratingKey/title (see
		// above) — for a show/movie/album that's already been fully synced, that stub
		// re-upsert must not clobber the richer data already on file, so every other field
		// here falls back to `existing` rather than a bare null.
		year: item.year ?? existing?.year ?? null,
		tmdbId: tmdbId ?? existing?.tmdbId ?? null,
		tvdbId: tvdbId ?? existing?.tvdbId ?? null,
		imdbId: imdbId ?? existing?.imdbId ?? null,
		plexRatingKey: item.ratingKey,
		parentId: parentId ?? existing?.parentId ?? null,
		// Tracks almost never carry their own `thumb` in Plex — a track has no artwork
		// distinct from its album's cover — so fall back to the parent album's own cover
		// (looked up from our DB above) before giving up and falling back to whatever's
		// already stored.
		plexThumb:
			item.thumb ?? (type === 'track' ? parentPlexThumb : undefined) ?? existing?.plexThumb ?? null,
		plexArt: item.art ?? existing?.plexArt ?? null,
		tagline: item.tagline ?? existing?.tagline ?? null,
		summary: item.summary ?? existing?.summary ?? null,
		runtimeMinutes: item.duration
			? Math.round(item.duration / 60000)
			: (existing?.runtimeMinutes ?? null),
		contentRating: item.contentRating ?? existing?.contentRating ?? null,
		genres: item.Genre?.length
			? JSON.stringify(item.Genre.map((g) => g.tag))
			: (existing?.genres ?? null),
		studio: item.studio ?? existing?.studio ?? null,
		criticRating: item.rating ?? existing?.criticRating ?? null,
		airDate: item.originallyAvailableAt ?? existing?.airDate ?? null,
		// On a season item, `index` is its own number; on an episode, `parentIndex` is its
		// season's number and `index` is its number within that season.
		seasonNumber:
			(type === 'season' ? item.index : type === 'episode' ? item.parentIndex : undefined) ??
			existing?.seasonNumber ??
			null,
		episodeNumber: (type === 'episode' ? item.index : undefined) ?? existing?.episodeNumber ?? null,
		episodeCount: (type === 'season' ? item.leafCount : undefined) ?? existing?.episodeCount ?? null
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
 * created before `enrichSparseItem` existed — they have a real `plexRatingKey`
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
