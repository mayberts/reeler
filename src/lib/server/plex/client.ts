import { getPlexConfig } from './config';

/**
 * Thin wrapper around the Plex Media Server API. Plex returns XML by default;
 * requesting `application/json` via the Accept header gets JSON instead.
 */
async function plexFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
	const { serverUrl, token } = await getPlexConfig();
	if (!serverUrl || !token) throw new Error('Plex server is not configured');
	const url = new URL(path, serverUrl);
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
	url.searchParams.set('X-Plex-Token', token);

	const response = await fetch(url, { headers: { Accept: 'application/json' } });
	if (!response.ok) {
		throw new Error(`Plex API request failed: ${response.status} ${response.statusText} (${path})`);
	}
	return response.json() as Promise<T>;
}

/** Validates a server URL + token pair against the actual server — for the Settings
 *  page's test button and pre-save validation. Takes explicit args rather than reading
 *  the configured settings, since it's meant to check values before they're saved. */
export async function verifyPlexConnection(serverUrl: string, token: string): Promise<boolean> {
	try {
		const url = new URL('/library/sections', serverUrl);
		url.searchParams.set('X-Plex-Token', token);
		const response = await fetch(url, { headers: { Accept: 'application/json' } });
		return response.ok;
	} catch {
		return false;
	}
}

/** Library sections (movies/shows/music) configured on the server. */
export function listLibrarySections() {
	return plexFetch<PlexLibrarySectionsResponse>('/library/sections');
}

/**
 * All items in a given library section, e.g. all movies in a "Movies" section. For a
 * music (artist-type) section, the section's direct children are artists — pass
 * `{ type: '9' }` to instead get a flat list of every album, the same way `type: '4'`
 * would flatten episodes under a show section. Plex's numeric metadata types: 9 = album.
 */
export function listSectionItems(sectionKey: string, params: Record<string, string> = {}) {
	return plexFetch<PlexMetadataResponse>(`/library/sections/${sectionKey}/all`, params);
}

/**
 * Full metadata for a single item by ratingKey. History entries and webhook payloads
 * for music are much sparser than this (see `enrichSparseMusicItem` in the sync
 * layer) — no parentRatingKey, thumb, duration, or genre — so this is used to fill
 * those in from the canonical source.
 */
export function getMetadata(ratingKey: string) {
	return plexFetch<PlexMetadataResponse>(`/library/metadata/${ratingKey}`);
}

/**
 * The direct children of a container item — an album's tracks. Each track comes back
 * with `parentRatingKey`/`parentTitle` already pointing at this album, the same as a
 * bulk library listing, so a returned item can be handed straight to
 * `upsertMediaItemFromPlex` without any further enrichment fetch.
 */
export function getChildren(ratingKey: string) {
	return plexFetch<PlexMetadataResponse>(`/library/metadata/${ratingKey}/children`);
}

/**
 * Watch history, optionally filtered to a single Plex Home user (`accountId`) and/or
 * since a given unix timestamp. Used both for initial backfill and as the polling
 * backstop that reconciles anything a missed webhook would otherwise lose.
 *
 * Unlike `/library/sections/.../all` (which Plex returns in full, unpaginated),
 * `/status/sessions/history/all` is a capped recent-activity feed — omitting
 * `X-Plex-Container-Start`/`Size` gets Plex's small default page instead of the whole
 * history. Callers that want everything must page through via `containerStart`/
 * `containerSize` and keep going using the returned `size`/`totalSize`.
 */
export function getWatchHistory(
	options: {
		accountId?: string;
		since?: number;
		containerStart?: number;
		containerSize?: number;
	} = {}
) {
	const params: Record<string, string> = {};
	if (options.accountId) params.accountID = options.accountId;
	if (options.since) params['viewedAt>'] = String(options.since);
	params['X-Plex-Container-Start'] = String(options.containerStart ?? 0);
	params['X-Plex-Container-Size'] = String(options.containerSize ?? 200);
	return plexFetch<PlexMetadataResponse>('/status/sessions/history/all', params);
}

/**
 * The Plex Media Server's own local user accounts — distinct from, and numbered
 * differently to, plex.tv's global account ids. History (`/status/sessions/history/all`)
 * and webhook payloads both key on this server-local id, so it's what has to be stored
 * as a user's `plexAccountId`, not the id from the plex.tv OAuth user lookup.
 */
export function listServerAccounts() {
	return plexFetch<PlexAccountsResponse>('/accounts');
}

/**
 * Sets a rating on a media item in Plex (0-10, half-star granularity), used to write
 * an in-app rating change back so Plex stays in sync.
 */
export async function rateMedia(ratingKey: string, rating: number): Promise<void> {
	const { serverUrl, token } = await getPlexConfig();
	if (!serverUrl || !token) throw new Error('Plex server is not configured');
	const url = new URL('/:/rate', serverUrl);
	url.searchParams.set('key', ratingKey);
	url.searchParams.set('identifier', 'com.plexapp.plugins.library');
	url.searchParams.set('rating', String(rating));
	url.searchParams.set('X-Plex-Token', token);

	const response = await fetch(url, { method: 'PUT' });
	if (!response.ok) {
		throw new Error(`Plex rate request failed: ${response.status} ${response.statusText}`);
	}
}

/**
 * Marks a media item watched in Plex — used to push Reeler's own watch history back
 * to Plex (recovering from a Plex-side history loss). Plex's `/:/scrobble` has no
 * parameter for a historical timestamp: it always sets `lastViewedAt` to the moment
 * of the call, so this can restore *that an item was watched* but never *when* — see
 * `pushHistoryToPlex` in `sync/history.ts` for how that's worked around (only called
 * for items Plex doesn't already show as watched, so it never overwrites a real date).
 * Always acts as whichever Plex account the configured admin token belongs to — the
 * classic API has no way to scrobble on behalf of a different Plex Home user.
 */
export async function scrobbleMedia(ratingKey: string): Promise<void> {
	const { serverUrl, token } = await getPlexConfig();
	if (!serverUrl || !token) throw new Error('Plex server is not configured');
	const url = new URL('/:/scrobble', serverUrl);
	url.searchParams.set('key', ratingKey);
	url.searchParams.set('identifier', 'com.plexapp.plugins.library');
	url.searchParams.set('X-Plex-Token', token);

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Plex scrobble request failed: ${response.status} ${response.statusText}`);
	}
}

// Minimal shape of the fields Reeler actually reads; Plex's real payloads are much larger.
export interface PlexLibrarySectionsResponse {
	MediaContainer: {
		Directory: Array<{ key: string; title: string; type: 'movie' | 'show' | 'artist' }>;
	};
}

export interface PlexMetadataItem {
	ratingKey: string;
	title: string;
	type: string;
	year?: number;
	accountID?: number;
	viewedAt?: number;
	/**
	 * Plex's own permanent per-item watch counter/timestamp, present on every library
	 * listing response — distinct from (and not subject to the same retention/rematch
	 * quirks as) the `/status/sessions/history/all` event log. Reflects whichever
	 * account the request's token belongs to, not each Plex Home member individually.
	 */
	viewCount?: number;
	lastViewedAt?: number;
	userRating?: number;
	guid?: string;
	Guid?: Array<{ id: string }>;
	/** For tracks/episodes: the containing album/season's ratingKey/title. For seasons: the show's. */
	parentRatingKey?: string;
	parentTitle?: string;
	/** Relative path to the poster image, e.g. `/library/metadata/123/thumb/169...`. */
	thumb?: string;
	/** Relative path to the backdrop/art image. */
	art?: string;
	tagline?: string;
	summary?: string;
	/** Milliseconds. */
	duration?: number;
	contentRating?: string;
	Genre?: Array<{ tag: string }>;
	/** Network (shows) or studio (movies). */
	studio?: string;
	/** Critic score, 0-10 (e.g. Rotten Tomatoes), distinct from `userRating`. */
	rating?: number;
	/** Season/episode ordinal — on a season item, its number; on an episode, its number within the season. */
	index?: number;
	/** On an episode item, its season's number. */
	parentIndex?: number;
	/** Plex's own child count for any container item — a season's episode count, or an
	 *  album's track count. */
	leafCount?: number;
	/** Air date, `YYYY-MM-DD` — set on episode (and movie) items. */
	originallyAvailableAt?: string;
}

export interface PlexMetadataResponse {
	MediaContainer: {
		Metadata?: PlexMetadataItem[];
		// Present on paginated endpoints (e.g. history) — `size` is how many entries
		// this response page holds, `totalSize` is the full result count across all
		// pages. Absent on endpoints that always return everything in one shot.
		size?: number;
		totalSize?: number;
	};
}

export interface PlexAccountsResponse {
	MediaContainer: {
		Account?: Array<{ id: number; name: string }>;
	};
}
