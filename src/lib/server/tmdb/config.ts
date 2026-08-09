import { env } from '$env/dynamic/private';

/** TMDb is optional — manual/non-Plex logging is just disabled without an API key set. */
export function getTmdbApiKey(): string | null {
	return env.TMDB_API_KEY || null;
}
