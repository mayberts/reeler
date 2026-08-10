import { error, fail } from '@sveltejs/kit';
import { eq, desc, and, or, count } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { watchHistory, mediaItems, ratings, type MediaType } from '$lib/server/db/schema';
import { searchTmdb, getTmdbDetails } from '$lib/server/tmdb/client';
import { getTmdbReadAccessToken } from '$lib/server/tmdb/config';
import { searchTvdb, getTvdbDetails } from '$lib/server/tvdb/client';
import { getTvdbApiKey } from '$lib/server/tvdb/config';
import { searchMusicBrainz, getMusicBrainzDetails } from '$lib/server/musicbrainz/client';
import { getOwnedLists } from '$lib/server/lists';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 40;
const historyTypeValues = ['movie', 'show', 'music'] as const;
type HistoryTypeFilter = (typeof historyTypeValues)[number];

function isHistoryTypeFilter(value: string | null): value is HistoryTypeFilter {
	return !!value && (historyTypeValues as readonly string[]).includes(value);
}

interface ManualLogResult {
	source: 'tmdb' | 'tvdb';
	externalId: string;
	title: string;
	year: number | null;
	mediaType: 'movie' | 'show';
	posterUrl: string | null;
}

/**
 * TMDb is the primary manual-log search — it covers both movies and TV and is usually
 * more complete. TVDB only kicks in as a fallback when TMDb has literally nothing for
 * the query, scoped to shows (see the Settings page's own copy: "shows not on TMDB"),
 * rather than always querying both and merging — keeps the common case to one request
 * and avoids TVDB results outranking better TMDb matches for anything TMDb does have.
 */
async function searchForManualLog(query: string): Promise<ManualLogResult[]> {
	const tmdbResults = await searchTmdb(query);
	if (tmdbResults.length > 0) {
		return tmdbResults.map((r) => ({
			source: 'tmdb' as const,
			externalId: r.tmdbId,
			title: r.title,
			year: r.year,
			mediaType: r.mediaType,
			posterUrl: r.posterUrl
		}));
	}

	const tvdbResults = await searchTvdb(query);
	return tvdbResults.map((r) => ({
		source: 'tvdb' as const,
		externalId: r.tvdbId,
		title: r.title,
		year: r.year,
		mediaType: 'show' as const,
		posterUrl: r.posterUrl
	}));
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Not authenticated');
	const user = locals.user;

	const typeParam = url.searchParams.get('type');
	const typeFilter = isHistoryTypeFilter(typeParam) ? typeParam : null;
	const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);

	const typeCondition =
		typeFilter === 'movie' || typeFilter === 'show'
			? eq(mediaItems.type, typeFilter)
			: typeFilter === 'music'
				? or(eq(mediaItems.type, 'album'), eq(mediaItems.type, 'track'))
				: undefined;

	const where = typeCondition
		? and(eq(watchHistory.userId, user.id), typeCondition)
		: eq(watchHistory.userId, user.id);

	const [[{ total }], rows, myLists] = await Promise.all([
		db
			.select({ total: count() })
			.from(watchHistory)
			.innerJoin(mediaItems, eq(watchHistory.mediaItemId, mediaItems.id))
			.where(where),
		db
			.select({
				id: watchHistory.id,
				watchedAt: watchHistory.watchedAt,
				source: watchHistory.source,
				mediaItem: mediaItems,
				rating: ratings.value
			})
			.from(watchHistory)
			.innerJoin(mediaItems, eq(watchHistory.mediaItemId, mediaItems.id))
			.leftJoin(ratings, and(eq(ratings.mediaItemId, mediaItems.id), eq(ratings.userId, user.id)))
			.where(where)
			.orderBy(desc(watchHistory.watchedAt))
			.limit(PAGE_SIZE)
			.offset((page - 1) * PAGE_SIZE),
		getOwnedLists(user.id)
	]);

	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	const logQuery = url.searchParams.get('logQuery')?.trim() ?? '';
	const musicLogQuery = url.searchParams.get('musicLogQuery')?.trim() ?? '';
	const [logResults, tmdbToken, tvdbKey, musicLogResults] = await Promise.all([
		logQuery ? searchForManualLog(logQuery) : Promise.resolve([]),
		getTmdbReadAccessToken(),
		getTvdbApiKey(),
		musicLogQuery ? searchMusicBrainz(musicLogQuery) : Promise.resolve([])
	]);

	return {
		history: rows,
		total,
		page,
		totalPages,
		typeFilter,
		logQuery,
		logResults,
		manualLogEnabled: tmdbToken !== null || tvdbKey !== null,
		musicLogQuery,
		musicLogResults,
		myLists
	};
};

export const actions: Actions = {
	logManual: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		const user = locals.user;

		const form = await request.formData();
		const source = form.get('source');
		const externalId = form.get('externalId');
		const title = form.get('title');
		const yearRaw = form.get('year');
		const mediaType = form.get('mediaType');
		const watchedAtRaw = form.get('watchedAt');
		const posterUrlRaw = form.get('posterUrl');

		if (
			(source !== 'tmdb' && source !== 'tvdb') ||
			typeof externalId !== 'string' ||
			typeof title !== 'string' ||
			(mediaType !== 'movie' && mediaType !== 'show')
		) {
			return fail(400, { context: 'movie' as const, message: 'Missing fields' });
		}

		const year = typeof yearRaw === 'string' && yearRaw ? Number(yearRaw) : null;
		const watchedAt =
			typeof watchedAtRaw === 'string' && watchedAtRaw ? new Date(watchedAtRaw) : new Date();
		const artworkUrl = typeof posterUrlRaw === 'string' && posterUrlRaw ? posterUrlRaw : null;

		const idColumn = source === 'tmdb' ? mediaItems.tmdbId : mediaItems.tvdbId;
		let mediaItem = await db.query.mediaItems.findFirst({
			where: eq(idColumn, externalId)
		});

		if (!mediaItem) {
			// Best-effort — a failed detail fetch shouldn't block logging the watch itself,
			// it just means the detail page will be a little sparser for this item. TVDB
			// doesn't expose a tagline/backdrop in the same shape TMDb does (see
			// `getTvdbDetails`), so those stay null for a TVDB-sourced item.
			let details: {
				tagline: string | null;
				summary: string | null;
				runtimeMinutes: number | null;
				genres: string[];
				backdropUrl: string | null;
			} | null = null;
			try {
				if (source === 'tmdb') {
					const d = await getTmdbDetails(externalId, mediaType);
					details = d && { ...d };
				} else {
					const d = await getTvdbDetails(externalId);
					details = d && { ...d, tagline: null, backdropUrl: null };
				}
			} catch (err) {
				console.error(`[history] failed to fetch ${source} details`, err);
			}

			const [created] = await db
				.insert(mediaItems)
				.values({
					type: mediaType as MediaType,
					title,
					year,
					tmdbId: source === 'tmdb' ? externalId : null,
					tvdbId: source === 'tvdb' ? externalId : null,
					artworkUrl,
					backdropUrl: details?.backdropUrl ?? null,
					tagline: details?.tagline ?? null,
					summary: details?.summary ?? null,
					runtimeMinutes: details?.runtimeMinutes ?? null,
					genres: details?.genres.length ? JSON.stringify(details.genres) : null
				})
				.returning();
			mediaItem = created;
		}

		await db.insert(watchHistory).values({
			userId: user.id,
			mediaItemId: mediaItem.id,
			watchedAt,
			source: 'manual'
		});

		return { context: 'movie' as const, loggedSuccess: true };
	},

	logManualMusic: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		const user = locals.user;

		const form = await request.formData();
		const musicbrainzId = form.get('musicbrainzId');
		const title = form.get('title');
		const artist = form.get('artist');
		const yearRaw = form.get('year');
		const watchedAtRaw = form.get('watchedAt');

		if (typeof musicbrainzId !== 'string' || typeof title !== 'string') {
			return fail(400, { context: 'music' as const, message: 'Missing fields' });
		}

		const year = typeof yearRaw === 'string' && yearRaw ? Number(yearRaw) : null;
		const watchedAt =
			typeof watchedAtRaw === 'string' && watchedAtRaw ? new Date(watchedAtRaw) : new Date();
		// MusicBrainz's own title field doesn't include the artist — folded in here (not
		// stored as a separate column) the same way Reeler already has no artist concept
		// for Plex-synced albums either, see DESIGN.md.
		const fullTitle = typeof artist === 'string' && artist ? `${title} — ${artist}` : title;

		let mediaItem = await db.query.mediaItems.findFirst({
			where: eq(mediaItems.musicbrainzId, musicbrainzId)
		});

		if (!mediaItem) {
			// Best-effort — cover art is commonly missing for a given release and that's
			// not a reason to block logging the watch itself.
			let artworkUrl: string | null = null;
			try {
				artworkUrl = (await getMusicBrainzDetails(musicbrainzId)).artworkUrl;
			} catch (err) {
				console.error('[history] failed to fetch MusicBrainz cover art', err);
			}

			const [created] = await db
				.insert(mediaItems)
				.values({
					type: 'album',
					title: fullTitle,
					year,
					musicbrainzId,
					artworkUrl
				})
				.returning();
			mediaItem = created;
		}

		await db.insert(watchHistory).values({
			userId: user.id,
			mediaItemId: mediaItem.id,
			watchedAt,
			source: 'manual'
		});

		return { context: 'music' as const, loggedMusicSuccess: true };
	},

	removeEntry: async ({ request, locals }) => {
		if (!locals.user) return fail(401);

		const form = await request.formData();
		const entryId = form.get('entryId');
		if (typeof entryId !== 'string') return fail(400, { message: 'Missing entry' });

		await db
			.delete(watchHistory)
			.where(and(eq(watchHistory.id, entryId), eq(watchHistory.userId, locals.user.id)));

		return { removedSuccess: true };
	}
};
