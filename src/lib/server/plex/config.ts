import { env } from '$env/dynamic/private';

function required(name: string, value: string | undefined): string {
	if (!value) throw new Error(`${name} is not set`);
	return value;
}

/** Connection details for the Plex Media Server this instance syncs from. */
export function getPlexConfig() {
	return {
		serverUrl: required('PLEX_SERVER_URL', env.PLEX_SERVER_URL).replace(/\/+$/, ''),
		/** Admin token, used for all library/history reads (per-user data is filtered via accountID). */
		token: required('PLEX_TOKEN', env.PLEX_TOKEN),
		/** Shared secret used as a URL segment on the webhook route, since Plex does not sign webhook payloads. */
		webhookToken: required('PLEX_WEBHOOK_TOKEN', env.PLEX_WEBHOOK_TOKEN)
	};
}
