import { sqliteClient } from '$lib/server/db';
import type { RequestHandler } from './$types';

/**
 * Used by the Docker `HEALTHCHECK` (see the Dockerfile) and any external monitoring —
 * deliberately public (see `PUBLIC_PATH_PREFIXES` in hooks.server.ts) so it reports
 * process/DB health rather than just "is the auth redirect working." Runs a trivial
 * query rather than just returning 200 unconditionally, so a wedged/corrupted database
 * — the main way this single-container app can be "up" but not actually working — shows
 * as unhealthy instead of green.
 */
export const GET: RequestHandler = () => {
	try {
		sqliteClient.prepare('SELECT 1').get();
		return new Response('ok');
	} catch (err) {
		console.error('[health] database check failed', err);
		return new Response('database unavailable', { status: 503 });
	}
};
