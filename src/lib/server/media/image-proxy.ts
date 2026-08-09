import { error } from '@sveltejs/kit';
import { getPlexConfig } from '$lib/server/plex/config';

/**
 * Shared by the poster and backdrop routes: proxies a Plex-hosted image server-side (so
 * the admin token never reaches the client) if a relative Plex path is given, otherwise
 * redirects to a public URL (TMDb's CDN), otherwise 404s.
 */
export async function respondWithImage(
	plexPath: string | null,
	publicUrl: string | null
): Promise<Response> {
	if (plexPath) {
		try {
			const { serverUrl, token } = getPlexConfig();
			const url = new URL(plexPath, serverUrl);
			url.searchParams.set('X-Plex-Token', token);

			const response = await fetch(url);
			if (!response.ok || !response.body) error(502, 'Failed to fetch image from Plex');

			return new Response(response.body, {
				headers: {
					'Content-Type': response.headers.get('Content-Type') ?? 'image/jpeg',
					'Cache-Control': 'private, max-age=86400'
				}
			});
		} catch (err) {
			console.error('[image-proxy] failed to proxy Plex image', err);
			error(502, 'Failed to fetch image from Plex');
		}
	}

	if (publicUrl) {
		return new Response(null, { status: 302, headers: { Location: publicUrl } });
	}

	error(404, 'No image available');
}
