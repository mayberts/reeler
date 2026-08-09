import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users, watchHistory, ratings } from '$lib/server/db/schema';
import { upsertMediaItemFromPlex } from '$lib/server/sync/media-item';
import type { PlexMetadataItem } from './client';

/** Shape of the JSON Plex embeds in the `payload` field of a webhook POST. */
export interface PlexWebhookPayload {
	event: string;
	user: boolean;
	owner: boolean;
	Account: { id: number; title: string };
	Metadata?: PlexMetadataItem;
}

async function findLinkedUser(plexAccountId: number) {
	return db.query.users.findFirst({ where: eq(users.plexAccountId, String(plexAccountId)) });
}

/**
 * Entry point for real-time Plex events. This is the primary path for watch history
 * and ratings; the polling reconciliation in the sync engine exists only to backstop
 * events dropped here.
 */
export async function handlePlexWebhookEvent(payload: PlexWebhookPayload): Promise<void> {
	const user = await findLinkedUser(payload.Account.id);
	if (!user) {
		console.log(
			`[plex webhook] ignoring event for unlinked Plex account: ${payload.Account.title}`
		);
		return;
	}

	switch (payload.event) {
		case 'media.scrobble':
			await handleScrobble(user.id, payload.Metadata);
			break;
		case 'media.rate':
			await handleRate(user.id, payload.Metadata);
			break;
		case 'media.play':
		case 'media.pause':
		case 'media.stop':
			// Not persisted yet — these would drive a "currently watching" feature later.
			break;
		default:
			console.log(`[plex webhook] ignoring unhandled event: ${payload.event}`);
	}
}

async function handleScrobble(userId: string, metadata: PlexMetadataItem | undefined) {
	if (!metadata) return;
	const mediaItemId = await upsertMediaItemFromPlex(metadata);
	if (!mediaItemId) return;

	await db.insert(watchHistory).values({
		userId,
		mediaItemId,
		watchedAt: new Date(),
		source: 'plex'
	});
}

async function handleRate(userId: string, metadata: PlexMetadataItem | undefined) {
	if (!metadata || metadata.userRating === undefined) return;
	const mediaItemId = await upsertMediaItemFromPlex(metadata);
	if (!mediaItemId) return;

	const existing = await db.query.ratings.findFirst({
		where: and(eq(ratings.userId, userId), eq(ratings.mediaItemId, mediaItemId))
	});

	if (existing) {
		await db
			.update(ratings)
			.set({ value: metadata.userRating, updatedAt: new Date() })
			.where(eq(ratings.id, existing.id));
	} else {
		await db.insert(ratings).values({ userId, mediaItemId, value: metadata.userRating });
	}
}
