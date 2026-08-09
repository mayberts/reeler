import { count } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users, mediaItems, watchHistory } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [[userCount], [mediaCount], [historyCount]] = await Promise.all([
		db.select({ value: count() }).from(users),
		db.select({ value: count() }).from(mediaItems),
		db.select({ value: count() }).from(watchHistory)
	]);

	return {
		userCount: userCount.value,
		mediaCount: mediaCount.value,
		historyCount: historyCount.value
	};
};
