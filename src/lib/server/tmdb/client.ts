import { getTmdbReadAccessToken } from './config';

const TMDB_BASE = 'https://api.themoviedb.org/3';
// TMDb's image CDN is public — no API key/auth needed to fetch from it, so unlike Plex
// posters, these can be linked to directly from the client.
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';
const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';
const TMDB_PROFILE_BASE = 'https://image.tmdb.org/t/p/w185';

/** Checks a v4 Read Access Token is actually valid, for the Settings page's test button
 *  and for validating before saving — TMDb's `/authentication` endpoint accepts any
 *  credential and just reports whether it authenticated. */
export async function verifyTmdbToken(token: string): Promise<boolean> {
	try {
		const response = await fetch(`${TMDB_BASE}/authentication`, {
			headers: { Authorization: `Bearer ${token}` }
		});
		if (!response.ok) return false;
		const data = (await response.json()) as { success?: boolean };
		return data.success === true;
	} catch {
		return false;
	}
}

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
	const token = await getTmdbReadAccessToken();
	if (!token) return [];

	const url = new URL(`${TMDB_BASE}/search/multi`);
	url.searchParams.set('query', query);

	const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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
	const token = await getTmdbReadAccessToken();
	if (!token) return null;

	const path = mediaType === 'movie' ? 'movie' : 'tv';
	const url = new URL(`${TMDB_BASE}/${path}/${tmdbId}`);

	const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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

// Not TMDb's full department list (camera, sound, editing, ...) — just the roles
// worth surfacing as "who made this", same reasoning `credits.job`'s docstring gives.
const CREW_JOBS = new Set([
	'Director',
	'Writer',
	'Screenplay',
	'Story',
	'Creator',
	'Producer',
	'Executive Producer'
]);

export interface TmdbCastMember {
	tmdbId: string;
	name: string;
	character: string;
	profileUrl: string | null;
	order: number;
}

export interface TmdbCrewMember {
	tmdbId: string;
	name: string;
	job: string;
	department: string;
	profileUrl: string | null;
}

export interface TmdbCredits {
	cast: TmdbCastMember[];
	crew: TmdbCrewMember[];
}

interface TmdbCreditPerson {
	id: number;
	name: string;
	profile_path?: string | null;
}

interface TmdbCreditsResponse {
	cast?: Array<TmdbCreditPerson & { character?: string; order?: number }>;
	crew?: Array<TmdbCreditPerson & { job?: string; department?: string }>;
}

/**
 * Cast/crew for a movie or show. Cast is capped at 20 (TMDb's own billing order) —
 * enough for a "top cast" grid without pulling in every background extra. Crew is
 * filtered to `CREW_JOBS`, since TMDb's crew list for a modern production commonly
 * runs into the hundreds of names across every department.
 */
export async function getTmdbCredits(
	tmdbId: string,
	mediaType: 'movie' | 'show'
): Promise<TmdbCredits | null> {
	const token = await getTmdbReadAccessToken();
	if (!token) return null;

	const path = mediaType === 'movie' ? 'movie' : 'tv';
	const url = new URL(`${TMDB_BASE}/${path}/${tmdbId}/credits`);

	const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
	if (!response.ok) {
		throw new Error(`TMDb credits fetch failed: ${response.status} ${response.statusText}`);
	}

	const data: TmdbCreditsResponse = await response.json();

	const seenCrew = new Set<string>();
	const crew: TmdbCrewMember[] = [];
	for (const member of data.crew ?? []) {
		if (!member.job || !CREW_JOBS.has(member.job)) continue;
		const key = `${member.id}:${member.job}`;
		if (seenCrew.has(key)) continue;
		seenCrew.add(key);
		crew.push({
			tmdbId: String(member.id),
			name: member.name,
			job: member.job,
			department: member.department ?? '',
			profileUrl: member.profile_path ? `${TMDB_PROFILE_BASE}${member.profile_path}` : null
		});
	}

	return {
		cast: (data.cast ?? []).slice(0, 20).map((member) => ({
			tmdbId: String(member.id),
			name: member.name,
			character: member.character ?? '',
			profileUrl: member.profile_path ? `${TMDB_PROFILE_BASE}${member.profile_path}` : null,
			order: member.order ?? 0
		})),
		crew
	};
}

export interface TmdbPersonDetails {
	name: string;
	biography: string | null;
	birthday: string | null;
	deathday: string | null;
	placeOfBirth: string | null;
	knownForDepartment: string | null;
	profileUrl: string | null;
}

interface TmdbPersonResponse {
	name: string;
	biography?: string;
	birthday?: string | null;
	deathday?: string | null;
	place_of_birth?: string | null;
	known_for_department?: string | null;
	profile_path?: string | null;
}

/** Full bio/personal info for a person — fetched once, the first time their page is
 *  viewed (see `getOrFetchCredits`'s docstring for why this app fetches credits lazily
 *  rather than during sync; the same reasoning applies here). */
export async function getTmdbPerson(tmdbId: string): Promise<TmdbPersonDetails | null> {
	const token = await getTmdbReadAccessToken();
	if (!token) return null;

	const url = new URL(`${TMDB_BASE}/person/${tmdbId}`);
	const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
	if (!response.ok) {
		throw new Error(`TMDb person fetch failed: ${response.status} ${response.statusText}`);
	}

	const data: TmdbPersonResponse = await response.json();

	return {
		name: data.name,
		biography: data.biography || null,
		birthday: data.birthday || null,
		deathday: data.deathday || null,
		placeOfBirth: data.place_of_birth || null,
		knownForDepartment: data.known_for_department || null,
		profileUrl: data.profile_path ? `${TMDB_PROFILE_BASE}${data.profile_path}` : null
	};
}

export interface TmdbKnownForItem {
	tmdbId: string;
	title: string;
	year: number | null;
	mediaType: 'movie' | 'show';
	posterUrl: string | null;
}

interface TmdbCombinedCreditsItem {
	id: number;
	media_type: string;
	title?: string;
	name?: string;
	release_date?: string;
	first_air_date?: string;
	poster_path?: string | null;
	popularity?: number;
}

interface TmdbCombinedCreditsResponse {
	cast?: TmdbCombinedCreditsItem[];
	crew?: TmdbCombinedCreditsItem[];
}

/**
 * A person's most notable movie/TV credits — a "Known For" strip on their page, purely
 * a browsing aid (not persisted; Reeler doesn't track titles outside what's actually in
 * the library, and a "known for" list drifts as a career progresses anyway, so it's
 * re-fetched live on every view rather than cached like the person's own bio is).
 */
export async function getTmdbPersonKnownFor(tmdbId: string): Promise<TmdbKnownForItem[]> {
	const token = await getTmdbReadAccessToken();
	if (!token) return [];

	const url = new URL(`${TMDB_BASE}/person/${tmdbId}/combined_credits`);
	const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
	if (!response.ok) {
		throw new Error(
			`TMDb combined credits fetch failed: ${response.status} ${response.statusText}`
		);
	}

	const data: TmdbCombinedCreditsResponse = await response.json();
	const all = [...(data.cast ?? []), ...(data.crew ?? [])];

	const byId = new Map<number, TmdbCombinedCreditsItem>();
	for (const item of all) {
		if (item.media_type !== 'movie' && item.media_type !== 'tv') continue;
		const existing = byId.get(item.id);
		if (!existing || (item.popularity ?? 0) > (existing.popularity ?? 0)) byId.set(item.id, item);
	}

	return Array.from(byId.values())
		.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
		.slice(0, 8)
		.map((item) => ({
			tmdbId: String(item.id),
			title: item.title ?? item.name ?? 'Untitled',
			year: parseYear(item.release_date ?? item.first_air_date),
			mediaType: (item.media_type === 'movie' ? 'movie' : 'show') as 'movie' | 'show',
			posterUrl: item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : null
		}));
}
