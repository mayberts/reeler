import { syncLibrary } from './library';
import { backfillAllUsers } from './history';

const LIBRARY_SYNC_INTERVAL_MS = 60 * 60 * 1000; // hourly
const HISTORY_POLL_INTERVAL_MS = 15 * 60 * 1000; // backstop for missed webhooks

let started = false;

async function runLibrarySync() {
	try {
		const result = await syncLibrary();
		console.log(
			`[sync] library: ${result.itemsUpserted} items across ${result.sectionsScanned} sections`
		);
	} catch (err) {
		console.error('[sync] library sync failed', err);
	}
}

async function runHistoryBackstop() {
	try {
		// Overlaps the previous window by 2x as a margin against timer drift / a slow cycle.
		const since = new Date(Date.now() - HISTORY_POLL_INTERVAL_MS * 2);
		const results = await backfillAllUsers(since);
		const inserted = results.reduce((sum, r) => sum + r.entriesInserted, 0);
		if (inserted > 0) console.log(`[sync] history backstop inserted ${inserted} entries`);
	} catch (err) {
		console.error('[sync] history backstop failed', err);
	}
}

/**
 * Starts the background sync loops: periodic library metadata sync, and a watch-history
 * poll that backstops the real-time webhook path in case a delivery is missed. Safe to
 * call more than once per process — only the first call does anything.
 */
export function startBackgroundSync() {
	if (started) return;
	started = true;

	void runLibrarySync();
	void runHistoryBackstop();
	setInterval(runLibrarySync, LIBRARY_SYNC_INTERVAL_MS);
	setInterval(runHistoryBackstop, HISTORY_POLL_INTERVAL_MS);
}
