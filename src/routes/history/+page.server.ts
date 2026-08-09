import { error } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { watchHistory } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) error(401, 'Not authenticated');
	const user = locals.user;

	const history = await db.query.watchHistory.findMany({
		where: eq(watchHistory.userId, user.id),
		orderBy: desc(watchHistory.watchedAt),
		limit: 200,
		with: { mediaItem: true }
	});

	return { history };
};
