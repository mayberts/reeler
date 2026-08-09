import { getTmdbApiKey } from './config';

const TMDB_BASE = 'https://api.themoviedb.org/3';
// TMDb's image CDN is public — no API key/auth needed to fetch from it, so unlike Plex
// posters, these can be linked to directly from the client.
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';
const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';

export interface TmdbSearchResult {
	tmdbId: string;
	title: string;
	year: number | null;
	mediaType: 'movie' | 'show';
	posterUrl: string | null;
}

interface TmdbMultiSearchItem {
	id: number;
	media_type: string;
	title?: string;
	name?: string;
	release_date?: string;
	first_air_date?: string;
	poster_path?: string | null;
}

interface TmdbMultiSearchResponse {
	results: TmdbMultiSearchItem[];
}

function parseYear(dateStr: string | undefined): number | null {
	if (!dateStr) return null;
	const year = Number(dateStr.slice(0, 4));
	return Number.isFinite(year) ? year : null;
}

/**
 * Searches TMDb for movies and TV shows matching a title, for manually logging things
 * not in the synced Plex library. Returns [] rather than throwing when TMDb isn't
 * configured — the feature is just unavailable, not a hard failure.
 */
export async function searchTmdb(query: string): Promise<TmdbSearchResult[]> {
	const apiKey = getTmdbApiKey();
	if (!apiKey) return [];

	const url = new URL(`${TMDB_BASE}/search/multi`);
	url.searchParams.set('api_key', apiKey);
	url.searchParams.set('query', query);

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`TMDb search failed: ${response.status} ${response.statusText}`);
	}

	const data: TmdbMultiSearchResponse = await response.json();

	return data.results
		.filter((item) => item.media_type === 'movie' || item.media_type === 'tv')
		.map((item) => ({
			tmdbId: String(item.id),
			title: item.title ?? item.name ?? 'Untitled',
			year: parseYear(item.release_date ?? item.first_air_date),
			mediaType: (item.media_type === 'movie' ? 'movie' : 'show') as 'movie' | 'show',
			posterUrl: item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : null
		}));
}

export interface TmdbDetails {
	tagline: string | null;
	summary: string | null;
	runtimeMinutes: number | null;
	genres: string[];
	backdropUrl: string | null;
}

interface TmdbDetailsResponse {
	tagline?: string;
	overview?: string;
	runtime?: number;
	episode_run_time?: number[];
	genres?: Array<{ name: string }>;
	backdrop_path?: string | null;
}

/**
 * Fetches the fuller detail record for a manually-logged item, at log time — TMDb's
 * search endpoint doesn't include tagline/genres/runtime, only a separate per-title
 * detail endpoint does. Note: unlike Plex, this doesn't populate contentRating — TMDb
 * puts that behind a further region-specific call (release_dates for movies,
 * content_ratings for TV) that isn't worth the extra request for a secondary feature.
 */
export async function getTmdbDetails(
	tmdbId: string,
	mediaType: 'movie' | 'show'
): Promise<TmdbDetails | null> {
	const apiKey = getTmdbApiKey();
	if (!apiKey) return null;

	const path = mediaType === 'movie' ? 'movie' : 'tv';
	const url = new URL(`${TMDB_BASE}/${path}/${tmdbId}`);
	url.searchParams.set('api_key', apiKey);

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`TMDb details fetch failed: ${response.status} ${response.statusText}`);
	}

	const data: TmdbDetailsResponse = await response.json();

	const runtimeMinutes =
		mediaType === 'movie' ? (data.runtime ?? null) : (data.episode_run_time?.[0] ?? null);

	return {
		tagline: data.tagline || null,
		summary: data.overview || null,
		runtimeMinutes,
		genres: data.genres?.map((g) => g.name) ?? [],
		backdropUrl: data.backdrop_path ? `${TMDB_BACKDROP_BASE}${data.backdrop_path}` : null
	};
}
