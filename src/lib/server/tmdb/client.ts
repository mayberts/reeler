import { getTmdbApiKey } from './config';

const TMDB_BASE = 'https://api.themoviedb.org/3';
// TMDb's image CDN is public — no API key/auth needed to fetch from it, so unlike Plex
// posters, these can be linked to directly from the client.
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';

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
