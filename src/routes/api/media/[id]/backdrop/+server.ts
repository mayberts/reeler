import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mediaItems } from '$lib/server/db/schema';
import { respondWithImage } from '$lib/server/media/image-proxy';
import type { RequestHandler } from './$types';

/** Same security model as the poster route — see image-proxy.ts. */
export const GET: RequestHandler = async ({ params }) => {
	const mediaItem = await db.query.mediaItems.findFirst({ where: eq(mediaItems.id, params.id) });
	if (!mediaItem) error(404, 'Not found');

	return respondWithImage(mediaItem.plexArt, mediaItem.backdropUrl);
};
