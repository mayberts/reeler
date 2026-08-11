import { error } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { people, mediaItems, credits, type MediaItem } from '$lib/server/db/schema';
import {
	getTmdbPerson,
	getTmdbPersonKnownFor,
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

	// Every title in *this* library this person has a credit on — distinct from "Known
	// For" above (TMDb's own list, live, can include titles never seen here at all).
	// Only reflects titles whose own cast/crew has actually been fetched already (see
	// getOrFetchCredits — it's lazy, per-title, not a sync-time crawl of every person's
	// entire history), so this fills in gradually rather than being complete from the
	// first page view.
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
