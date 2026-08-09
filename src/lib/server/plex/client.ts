import { getPlexConfig } from './config';

/**
 * Thin wrapper around the Plex Media Server API. Plex returns XML by default;
 * requesting `application/json` via the Accept header gets JSON instead.
 */
async function plexFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
	const { serverUrl, token } = getPlexConfig();
	const url = new URL(path, serverUrl);
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
	url.searchParams.set('X-Plex-Token', token);

	const response = await fetch(url, { headers: { Accept: 'application/json' } });
	if (!response.ok) {
		throw new Error(`Plex API request failed: ${response.status} ${response.statusText} (${path})`);
	}
	return response.json() as Promise<T>;
}

/** Library sections (movies/shows/music) configured on the server. */
export function listLibrarySections() {
	return plexFetch<PlexLibrarySectionsResponse>('/library/sections');
}

/** All items in a given library section, e.g. all movies in a "Movies" section. */
export function listSectionItems(sectionKey: string) {
	return plexFetch<PlexMetadataResponse>(`/library/sections/${sectionKey}/all`);
}

/**
 * Watch history, optionally filtered to a single Plex Home user (`accountId`) and/or
 * since a given unix timestamp. Used both for initial backfill and as the polling
 * backstop that reconciles anything a missed webhook would otherwise lose.
 */
export function getWatchHistory(options: { accountId?: string; since?: number } = {}) {
	const params: Record<string, string> = {};
	if (options.accountId) params.accountID = options.accountId;
	if (options.since) params['viewedAt>'] = String(options.since);
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
	const { serverUrl, token } = getPlexConfig();
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
	userRating?: number;
	guid?: string;
	Guid?: Array<{ id: string }>;
	/** For tracks: the containing album's ratingKey/title (present on track history/webhook entries). */
	parentRatingKey?: string;
	parentTitle?: string;
	/** Relative path to the poster image, e.g. `/library/metadata/123/thumb/169...`. */
	thumb?: string;
}

export interface PlexMetadataResponse {
	MediaContainer: {
		Metadata?: PlexMetadataItem[];
	};
}

export interface PlexAccountsResponse {
	MediaContainer: {
		Account?: Array<{ id: number; name: string }>;
	};
}
