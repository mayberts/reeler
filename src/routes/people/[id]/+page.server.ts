import { error } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { people, mediaItems, credits, type MediaItem } from '$lib/server/db/schema';
import {
	getTmdbPerson,
	getTmdbPersonKnownFor,
	getTmdbPersonAllCredits,
	type TmdbKnownForItem
} from '$lib/server/tmdb/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Not authenticated');

	let person = await db.query.people.findFirst({ where: eq(people.id, params.id) });
	if (!person) error(404, 'Not found');

	// Lazily fills in bio/personal info the first time this person's own page is
	// viewed — same reasoning as credits themselves (see getOrFetchCredits): a person
	// row created just from appearing in some title's cast/crew only has id/name/photo
	// until someone actually clicks through to them.
	if (!person.detailsFetchedAt) {
		try {
			const details = await getTmdbPerson(person.tmdbId);
			const [updated] = await db
				.update(people)
				.set({ ...details, detailsFetchedAt: new Date() })
				.where(eq(people.id, person.id))
				.returning();
			person = updated;
		} catch (err) {
			console.error('[people] failed to fetch person details from TMDb', { id: person.id }, err);
		}
	}

	let knownFor: TmdbKnownForItem[];
	try {
		knownFor = await getTmdbPersonKnownFor(person.tmdbId);
	} catch (err) {
		console.error('[people] failed to fetch known-for credits from TMDb', { id: person.id }, err);
		knownFor = [];
	}

	// Link a "Known For" title to its own Reeler page when it's actually in the
	// library (same tmdbId) — otherwise it links out to TMDb (handled client-side).
	const knownForTmdbIds = knownFor.map((k) => k.tmdbId);
	const localMatches =
		knownForTmdbIds.length > 0
			? await db.query.mediaItems.findMany({
					where: inArray(mediaItems.tmdbId, knownForTmdbIds)
				})
			: [];
	const localIdByTmdbId = new Map(localMatches.map((m) => [m.tmdbId, m.id]));

	// Every title in *this* library this person has worked on — distinct from "Known
	// For" above (TMDb's top-8-by-popularity strip). Two sources, combined:
	//
	// 1. The local `credits` table — accurate, can show *every* role a person has on a
	//    title (e.g. "Happy Hogan · Director" for an actor-director), but only exists
	//    for titles whose own cast/crew has actually been fetched already
	//    (getOrFetchCredits is lazy, per-title, not a sync-time crawl).
	// 2. TMDb's full (uncapped) combined-credits list, cross-referenced against the
	//    local library by tmdbId — catches every other title the person's actually in
	//    *right now*, without waiting for someone to open each one's own page first.
	//    Only ever shows one role per title this way (TMDb's own dedup), not a merged
	//    list like source 1 can — source 1 wins for any title both cover.
	const localCredits = await db.query.credits.findMany({
		where: eq(credits.personId, person.id),
		with: { mediaItem: true }
	});
	const inLibraryByItem = new Map<string, { mediaItem: MediaItem; roles: string[] }>();
	for (const credit of localCredits) {
		const entry = inLibraryByItem.get(credit.mediaItemId) ?? {
			mediaItem: credit.mediaItem,
			roles: []
		};
		const role = credit.role === 'cast' ? credit.character : credit.job;
		if (role) entry.roles.push(role);
		inLibraryByItem.set(credit.mediaItemId, entry);
	}

	let allCredits: TmdbKnownForItem[];
	try {
		allCredits = await getTmdbPersonAllCredits(person.tmdbId);
	} catch (err) {
		console.error('[people] failed to fetch full credits from TMDb', { id: person.id }, err);
		allCredits = [];
	}
	const allCreditsTmdbIds = allCredits.map((c) => c.tmdbId);
	const libraryMatches =
		allCreditsTmdbIds.length > 0
			? await db.query.mediaItems.findMany({
					where: inArray(mediaItems.tmdbId, allCreditsTmdbIds)
				})
			: [];
	const roleByTmdbId = new Map(allCredits.map((c) => [c.tmdbId, c.role]));
	for (const mediaItem of libraryMatches) {
		if (!mediaItem.tmdbId || inLibraryByItem.has(mediaItem.id)) continue;
		const role = roleByTmdbId.get(mediaItem.tmdbId);
		inLibraryByItem.set(mediaItem.id, { mediaItem, roles: role ? [role] : [] });
	}

	const inLibrary = Array.from(inLibraryByItem.values())
		.map(({ mediaItem, roles }) => ({
			id: mediaItem.id,
			title: mediaItem.title,
			year: mediaItem.year,
			hasArtwork: !!(mediaItem.plexThumb || mediaItem.artworkUrl),
			role: roles.join(' · ')
		}))
		.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

	return {
		person,
		knownFor: knownFor.map((k) => ({ ...k, localId: localIdByTmdbId.get(k.tmdbId) ?? null })),
		inLibrary
	};
};
