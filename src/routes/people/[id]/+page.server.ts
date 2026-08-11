import { error } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { people, mediaItems } from '$lib/server/db/schema';
import { getTmdbPerson, getTmdbPersonKnownFor } from '$lib/server/tmdb/client';
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

	const knownFor = await getTmdbPersonKnownFor(person.tmdbId);

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

	return {
		person,
		knownFor: knownFor.map((k) => ({ ...k, localId: localIdByTmdbId.get(k.tmdbId) ?? null }))
	};
};
