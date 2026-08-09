import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mediaItems } from '$lib/server/db/schema';
import { getPlexConfig } from '$lib/server/plex/config';
import type { RequestHandler } from './$types';

/**
 * Serves a media item's poster. Plex posters require the admin token, so they're
 * fetched here, server-side, and streamed back — the token never reaches the client,
 * unlike a naive `<img src>` pointed straight at Plex would. TMDb posters are already
 * public, so those just redirect to TMDb's own CDN instead of being proxied.
 */
export const GET: RequestHandler = async ({ params }) => {
	const mediaItem = await db.query.mediaItems.findFirst({ where: eq(mediaItems.id, params.id) });
	if (!mediaItem) error(404, 'Not found');

	if (mediaItem.plexThumb) {
		try {
			const { serverUrl, token } = getPlexConfig();
			const url = new URL(mediaItem.plexThumb, serverUrl);
			url.searchParams.set('X-Plex-Token', token);

			const response = await fetch(url);
			if (!response.ok || !response.body) error(502, 'Failed to fetch poster from Plex');

			return new Response(response.body, {
				headers: {
					'Content-Type': response.headers.get('Content-Type') ?? 'image/jpeg',
					'Cache-Control': 'private, max-age=86400'
				}
			});
		} catch (err) {
			console.error('[poster] failed to proxy Plex image', err);
			error(502, 'Failed to fetch poster from Plex');
		}
	}

	if (mediaItem.artworkUrl) {
		return new Response(null, { status: 302, headers: { Location: mediaItem.artworkUrl } });
	}

	error(404, 'No poster available');
};
