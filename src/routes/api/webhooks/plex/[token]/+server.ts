import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPlexConfig } from '$lib/server/plex/config';
import { handlePlexWebhookEvent, type PlexWebhookPayload } from '$lib/server/plex/webhook-handler';

/**
 * Receives Plex webhooks (Settings > Webhooks in Plex). Plex sends
 * `multipart/form-data` with the event JSON in a `payload` field, plus an
 * optional thumbnail attachment we don't need.
 *
 * Plex doesn't sign webhook requests, so the URL itself carries a shared-secret
 * token (`PLEX_WEBHOOK_TOKEN`) to keep this endpoint from accepting arbitrary POSTs.
 */
export const POST: RequestHandler = async ({ request, params }) => {
	const { webhookToken } = getPlexConfig();
	if (params.token !== webhookToken) {
		error(401, 'Invalid webhook token');
	}

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		error(400, 'Expected multipart/form-data body');
	}

	const raw = form.get('payload');
	if (typeof raw !== 'string') {
		error(400, 'Missing payload field');
	}

	let payload: PlexWebhookPayload;
	try {
		payload = JSON.parse(raw);
	} catch {
		error(400, 'Payload is not valid JSON');
	}

	await handlePlexWebhookEvent(payload);

	return json({ ok: true });
};
