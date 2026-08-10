const MB_BASE = 'https://musicbrainz.org/ws/2';
const COVER_ART_BASE = 'https://coverartarchive.org';
// MusicBrainz's API etiquette requires a descriptive User-Agent identifying the calling
// application (unauthenticated requests without one are aggressively rate-limited or
// blocked) — unlike TMDb/TVDB, there's no API key to send instead.
const USER_AGENT = 'Reeler/1.0 (+https://github.com/mayberts/reeler)';

export interface MusicBrainzSearchResult {
	musicbrainzId: string;
	title: string;
	artist: string | null;
	year: number | null;
}

interface MbArtistCredit {
	name?: string;
}

interface MbReleaseGroupSearchItem {
	id: string;
	title: string;
	'first-release-date'?: string;
	'artist-credit'?: MbArtistCredit[];
}

interface MbReleaseGroupSearchResponse {
	'release-groups'?: MbReleaseGroupSearchItem[];
}

function parseYear(dateStr: string | undefined): number | null {
	if (!dateStr) return null;
	const year = Number(dateStr.slice(0, 4));
	return Number.isFinite(year) ? year : null;
}

/**
 * Searches MusicBrainz for albums (release groups) matching a title — used for manually
 * logging music not in the synced Plex library. Needs no API key, unlike TMDb/TVDB:
 * MusicBrainz's core API is free and keyless, just rate-limited (1 req/sec
 * unauthenticated) and identified by User-Agent instead. Scoped to `primarytype:album`
 * (not singles/EPs/compilations) to match how Reeler already treats albums as the
 * manually-loggable music unit — tracks stay lazy, created from play history the same
 * way episodes are (see DESIGN.md).
 */
export async function searchMusicBrainz(query: string): Promise<MusicBrainzSearchResult[]> {
	const url = new URL(`${MB_BASE}/release-group/`);
	url.searchParams.set('query', `releasegroup:"${query}" AND primarytype:album`);
	url.searchParams.set('fmt', 'json');
	url.searchParams.set('limit', '20');

	let response: Response;
	try {
		response = await fetch(url, {
			headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
		});
	} catch {
		return [];
	}
	if (!response.ok) return [];

	const data: MbReleaseGroupSearchResponse = await response.json();
	return (data['release-groups'] ?? []).map((item) => ({
		musicbrainzId: item.id,
		title: item.title,
		artist: item['artist-credit']?.[0]?.name ?? null,
		year: parseYear(item['first-release-date'])
	}));
}

export interface MusicBrainzDetails {
	artworkUrl: string | null;
}

interface CoverArtImage {
	front?: boolean;
	image: string;
	thumbnails?: Record<string, string>;
}

interface CoverArtResponse {
	images?: CoverArtImage[];
}

/**
 * Best-effort cover art lookup, done at log time rather than search time — Cover Art
 * Archive (keyed by the same release-group MBID) would mean one extra request per
 * result if fetched for a whole search list, and a release having no art on file at all
 * is common, not an error, so a 404 here is expected and just means no artwork.
 */
export async function getMusicBrainzDetails(musicbrainzId: string): Promise<MusicBrainzDetails> {
	try {
		const response = await fetch(`${COVER_ART_BASE}/release-group/${musicbrainzId}`, {
			headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
		});
		if (!response.ok) return { artworkUrl: null };

		const data: CoverArtResponse = await response.json();
		const front = data.images?.find((img) => img.front) ?? data.images?.[0];
		return { artworkUrl: front?.thumbnails?.['250'] ?? front?.image ?? null };
	} catch {
		return { artworkUrl: null };
	}
}
