import { getAppSettings } from '$lib/server/settings';

/**
 * Connection details for the Plex Media Server this instance syncs from, resolved from
 * the Settings page (DB) with `.env` as a fallback — see `lib/server/settings.ts`.
 * Every field is nullable: callers that truly need a field (an actual PMS request, the
 * OAuth client id, the webhook secret) check for it themselves and fail in whatever way
 * is appropriate there, rather than this throwing centrally. That matters specifically
 * for `clientIdentifier` — the OAuth login flow only needs that one field, and must
 * keep working even before an admin has configured `serverUrl`/`token` in Settings.
 */
export async function getPlexConfig() {
	const settings = await getAppSettings();
	return {
		serverUrl: settings.plexServerUrl,
		/** Admin token, used for all library/history reads (per-user data is filtered via accountID). */
		token: settings.plexToken,
		/** Shared secret used as a URL segment on the webhook route, since Plex does not sign webhook payloads. */
		webhookToken: settings.plexWebhookToken,
		/** Stable id identifying this app instance to plex.tv for the OAuth PIN flow. Any fixed random string. */
		clientIdentifier: settings.plexClientIdentifier
	};
}
