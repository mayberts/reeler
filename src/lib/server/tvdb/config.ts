import { getAppSettings } from '$lib/server/settings';

/** TVDB is optional — only needed as a fallback for shows TMDb doesn't have. */
export async function getTvdbApiKey(): Promise<string | null> {
	return (await getAppSettings()).tvdbApiKey;
}
