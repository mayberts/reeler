import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { ratings, mediaItems } from '$lib/server/db/schema';
import { rateMedia } from '$lib/server/plex/client';

/**
 * Sets a user's rating locally, then best-effort writes it back to Plex if the item
 * has a plexRatingKey. A failed Plex write doesn't fail the request — the local rating
 * still took effect, and rating again later retries the write-back.
 */
export async function setRating(userId: string, mediaItemId: string, value: number) {
	const mediaItem = await db.query.mediaItems.findFirst({
		where: eq(mediaItems.id, mediaItemId)
	});
	if (!mediaItem) throw new Error('Media item not found');

	const existing = await db.query.ratings.findFirst({
		where: and(eq(ratings.userId, userId), eq(ratings.mediaItemId, mediaItemId))
	});

	if (existing) {
		await db
			.update(ratings)
			.set({ value, updatedAt: new Date() })
			.where(eq(ratings.id, existing.id));
	} else {
		await db.insert(ratings).values({ userId, mediaItemId, value });
	}

	if (mediaItem.plexRatingKey) {
		try {
			await rateMedia(mediaItem.plexRatingKey, value);
		} catch (err) {
			console.error('[ratings] failed to write rating back to Plex', err);
		}
	}
}
