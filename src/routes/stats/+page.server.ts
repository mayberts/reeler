import { error } from '@sveltejs/kit';
import { and, avg, count, countDistinct, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { watchHistory, ratings, mediaItems } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

const MONTH_EXPR = sql<string>`strftime('%Y-%m', ${watchHistory.watchedAt}, 'unixepoch')`;

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) error(401, 'Not authenticated');
	const userId = locals.user.id;

	const twelveMonthsAgo = new Date();
	twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
	twelveMonthsAgo.setDate(1);
	twelveMonthsAgo.setHours(0, 0, 0, 0);

	const [
		[{ totalWatches }],
		[{ uniqueTitles }],
		[{ totalRatings, avgRating }],
		byType,
		monthlyRows,
		topWatched,
		topRated
	] = await Promise.all([
		db.select({ totalWatches: count() }).from(watchHistory).where(eq(watchHistory.userId, userId)),
		db
			.select({ uniqueTitles: countDistinct(watchHistory.mediaItemId) })
			.from(watchHistory)
			.where(eq(watchHistory.userId, userId)),
		db
			.select({ totalRatings: count(), avgRating: avg(ratings.value) })
			.from(ratings)
			.where(eq(ratings.userId, userId)),
		db
			.select({ type: mediaItems.type, count: count() })
			.from(watchHistory)
			.innerJoin(mediaItems, eq(watchHistory.mediaItemId, mediaItems.id))
			.where(eq(watchHistory.userId, userId))
			.groupBy(mediaItems.type),
		db
			.select({ month: MONTH_EXPR, count: count() })
			.from(watchHistory)
			.where(and(eq(watchHistory.userId, userId), gte(watchHistory.watchedAt, twelveMonthsAgo)))
			.groupBy(MONTH_EXPR)
			.orderBy(MONTH_EXPR),
		db
			.select({
				mediaItemId: watchHistory.mediaItemId,
				title: mediaItems.title,
				year: mediaItems.year,
				watchCount: count()
			})
			.from(watchHistory)
			.innerJoin(mediaItems, eq(watchHistory.mediaItemId, mediaItems.id))
			.where(eq(watchHistory.userId, userId))
			.groupBy(watchHistory.mediaItemId)
			.orderBy(desc(count()))
			.limit(5),
		db
			.select({
				mediaItemId: ratings.mediaItemId,
				title: mediaItems.title,
				year: mediaItems.year,
				value: ratings.value
			})
			.from(ratings)
			.innerJoin(mediaItems, eq(ratings.mediaItemId, mediaItems.id))
			.where(eq(ratings.userId, userId))
			.orderBy(desc(ratings.value))
			.limit(5)
	]);

	// Fill in months with zero activity so the chart has a continuous 12-month axis.
	const monthlyByKey = new Map(monthlyRows.map((row) => [row.month, row.count]));
	const monthlyActivity: { month: string; count: number }[] = [];
	const cursor = new Date(twelveMonthsAgo);
	for (let i = 0; i < 12; i++) {
		const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
		monthlyActivity.push({ month: key, count: monthlyByKey.get(key) ?? 0 });
		cursor.setMonth(cursor.getMonth() + 1);
	}

	return {
		hero: {
			totalWatches,
			uniqueTitles,
			totalRatings,
			avgRating: avgRating ? Number(avgRating) : null
		},
		byType,
		monthlyActivity,
		topWatched,
		topRated
	};
};
