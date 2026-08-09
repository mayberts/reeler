import { json } from '@sveltejs/kit';
import { like } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mediaItems } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/** Title search over synced/logged media items, used by the ratings and lists UI. */
export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim();
	if (!q) return json({ results: [] });

	const results = await db.query.mediaItems.findMany({
		where: like(mediaItems.title, `%${q}%`),
		orderBy: (fields, { asc }) => asc(fields.title),
		limit: 20
	});

	return json({ results });
};
