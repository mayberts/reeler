import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { credits, people, type MediaItem, type Person } from '$lib/server/db/schema';
import { getTmdbCredits, type TmdbCastMember, type TmdbCrewMember } from '$lib/server/tmdb/client';

export interface CreditWithPerson {
	person: Person;
	character: string | null;
	job: string | null;
	department: string | null;
}

export interface Credits {
	cast: CreditWithPerson[];
	crew: CreditWithPerson[];
}

/** Upserts a person by their TMDb id — shared across every credit they have in the
 *  library, so a returning cast/crew member doesn't get a duplicate row. */
async function upsertPerson(member: TmdbCastMember | TmdbCrewMember): Promise<string> {
	const existing = await db.query.people.findFirst({
		where: eq(people.tmdbId, member.tmdbId)
	});
	if (existing) return existing.id;

	const [created] = await db
		.insert(people)
		.values({ tmdbId: member.tmdbId, name: member.name, profileUrl: member.profileUrl })
		.returning();
	return created.id;
}

/**
 * Cast/crew for a movie or show, fetched from TMDb and cached the first time it's
 * asked for — never during library sync or on any schedule, to keep those fast. Any
 * existing `credits` rows for this item are returned as-is without a fresh TMDb call.
 * Returns `null` (not `[]`) when there's no `tmdbId` to look up at all, or the type
 * isn't a top-level title.
 *
 * A title TMDb genuinely has zero cast *and* zero of the filtered crew jobs for (rare —
 * most titles have at least a director) leaves no rows behind to short-circuit on next
 * time, since there's nothing to distinguish "never looked up" from "looked up, found
 * nothing" without persisting a separate marker. Accepted as a minor inefficiency for
 * an edge case rather than adding schema just for it.
 */
export async function getOrFetchCredits(mediaItem: MediaItem): Promise<Credits | null> {
	if (mediaItem.type !== 'movie' && mediaItem.type !== 'show') return null;
	if (!mediaItem.tmdbId) return null;

	const existing = await db.query.credits.findMany({
		where: eq(credits.mediaItemId, mediaItem.id),
		orderBy: asc(credits.sortOrder),
		with: { person: true }
	});
	if (existing.length > 0) {
		return {
			cast: existing.filter((c) => c.role === 'cast'),
			crew: existing.filter((c) => c.role === 'crew')
		};
	}

	let fetched;
	try {
		fetched = await getTmdbCredits(mediaItem.tmdbId, mediaItem.type);
	} catch (err) {
		console.error('[credits] failed to fetch from TMDb', { mediaItemId: mediaItem.id }, err);
		return null;
	}
	if (!fetched) return null;
	if (fetched.cast.length === 0 && fetched.crew.length === 0) return { cast: [], crew: [] };

	const castRows: CreditWithPerson[] = [];
	for (const [index, member] of fetched.cast.entries()) {
		const personId = await upsertPerson(member);
		const [row] = await db
			.insert(credits)
			.values({
				mediaItemId: mediaItem.id,
				personId,
				role: 'cast',
				character: member.character || null,
				sortOrder: index
			})
			.returning();
		const person = await db.query.people.findFirst({ where: eq(people.id, personId) });
		if (person) castRows.push({ person, character: row.character, job: null, department: null });
	}

	const crewRows: CreditWithPerson[] = [];
	for (const member of fetched.crew) {
		const personId = await upsertPerson(member);
		const [row] = await db
			.insert(credits)
			.values({
				mediaItemId: mediaItem.id,
				personId,
				role: 'crew',
				job: member.job,
				department: member.department || null
			})
			.returning();
		const person = await db.query.people.findFirst({ where: eq(people.id, personId) });
		if (person)
			crewRows.push({ person, character: null, job: row.job, department: row.department });
	}

	return { cast: castRows, crew: crewRows };
}
