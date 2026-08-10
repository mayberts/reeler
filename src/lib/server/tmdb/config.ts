import { getAppSettings } from '$lib/server/settings';

/** TMDb is optional — manual/non-Plex logging is just disabled without a token set. */
export async function getTmdbReadAccessToken(): Promise<string | null> {
	return (await getAppSettings()).tmdbReadAccessToken;
}
