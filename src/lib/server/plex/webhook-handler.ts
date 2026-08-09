/** Shape of the JSON Plex embeds in the `payload` field of a webhook POST. */
export interface PlexWebhookPayload {
	event: string;
	user: boolean;
	owner: boolean;
	Account: { id: number; title: string };
	Metadata?: {
		ratingKey: string;
		type: string;
		title: string;
		userRating?: number;
	};
}

/**
 * Entry point for real-time Plex events (media.scrobble, media.rate, media.play, ...).
 * This is the primary path for watch history and ratings; the polling reconciliation
 * in the sync engine exists only to backstop events dropped here.
 *
 * TODO(phase 1): dispatch to watch-history/ratings sync once the sync engine lands.
 */
export async function handlePlexWebhookEvent(payload: PlexWebhookPayload): Promise<void> {
	switch (payload.event) {
		case 'media.scrobble':
		case 'media.rate':
		case 'media.play':
		case 'media.pause':
		case 'media.stop':
			console.log(`[plex webhook] ${payload.event}`, {
				account: payload.Account?.title,
				item: payload.Metadata?.title
			});
			break;
		default:
			console.log(`[plex webhook] ignoring unhandled event: ${payload.event}`);
	}
}
