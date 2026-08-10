import { getTvdbApiKey } from './config';

const TVDB_BASE = 'https://api4.thetvdb.com/v4';

interface TvdbLoginResponse {
	status: string;
	data?: { token?: string };
}

// TVDB v4 exchanges the admin-supplied API key for a short-lived bearer JWT (~1 month)
// via a login call, unlike TMDb's static bearer token — cached in-memory per key so a
// search doesn't re-login on every request. Keyed by the API key itself (not a single
// slot) so a key rotated via the Settings page doesn't serve a stale token for the old one.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const TOKEN_TTL_MS = 20 * 24 * 60 * 60 * 1000; // conservative vs. TVDB's ~1 month expiry

async function login(apiKey: string): Promise<string | null> {
	const cached = tokenCache.get(apiKey);
	if (cached && cached.expiresAt > Date.now()) return cached.token;

	const response = await fetch(`${TVDB_BASE}/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ apikey: apiKey })
	});
	if (!response.ok) return null;

	const data: TvdbLoginResponse = await response.json();
	const token = data.data?.token;
	if (!token) return null;

	tokenCache.set(apiKey, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
	return token;
}

/** Checks an API key is actually valid, for the Settings page's test button and for
 *  validating before saving. */
export async function verifyTvdbKey(apiKey: string): Promise<boolean> {
	try {
		return (await login(apiKey)) !== null;
	} catch {
		return false;
	}
}

/** Authenticated GET against the TVDB API, or null if TVDB isn't configured or the
 *  request fails — every caller here treats TVDB as optional, same as TMDb. */
async function tvdbGet<T>(path: string): Promise<T | null> {
	const apiKey = await getTvdbApiKey();
	if (!apiKey) return null;

	const token = await login(apiKey);
	if (!token) return null;

	const response = await fetch(`${TVDB_BASE}${path}`, {
		headers: { Authorization: `Bearer ${token}` }
	});
	if (!response.ok) return null;

	return response.json() as Promise<T>;
}

export interface TvdbSearchResult {
	tvdbId: string;
	title: string;
	year: number | null;
	posterUrl: string | null;
}

interface TvdbSearchItem {
	tvdb_id?: string;
	name?: string;
	year?: string;
	image_url?: string;
}

interface TvdbSearchResponse {
	data?: TvdbSearchItem[];
}

/**
 * Searches TVDB for series matching a title — used as a fallback when manually logging
 * a show TMDb doesn't have. TVDB's `/search` also covers movies/people/companies, so
 * `type=series` keeps this scoped to what it's actually a fallback for (see the
 * Settings page's own copy: "shows not on TMDB").
 */
export async function searchTvdb(query: string): Promise<TvdbSearchResult[]> {
	const data = await tvdbGet<TvdbSearchResponse>(
		`/search?query=${encodeURIComponent(query)}&type=series`
	);
	if (!data?.data) return [];

	return data.data
		.filter((item) => item.tvdb_id && item.name)
		.map((item) => ({
			tvdbId: item.tvdb_id!,
			title: item.name!,
			year: item.year ? Number(item.year) : null,
			posterUrl: item.image_url ?? null
		}));
}

export interface TvdbDetails {
	summary: string | null;
	runtimeMinutes: number | null;
	genres: string[];
}

interface TvdbSeriesExtendedResponse {
	data?: {
		overview?: string;
		averageRuntime?: number;
		genres?: Array<{ name: string }>;
	};
}

/**
 * Fetches the fuller detail record for a manually-logged TVDB show, at log time —
 * mirrors `getTmdbDetails`. TVDB doesn't expose a tagline or a separate backdrop image
 * in the same shape TMDb does, so those are left for a future pass rather than guessed
 * at from TVDB's less predictable artwork-type taxonomy.
 */
export async function getTvdbDetails(tvdbId: string): Promise<TvdbDetails | null> {
	const data = await tvdbGet<TvdbSeriesExtendedResponse>(`/series/${tvdbId}/extended`);
	if (!data?.data) return null;

	return {
		summary: data.data.overview || null,
		runtimeMinutes: data.data.averageRuntime || null,
		genres: data.data.genres?.map((g) => g.name) ?? []
	};
}
