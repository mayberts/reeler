/**
 * Static definitions for every badge — names, descriptions, tier thresholds, icons.
 * Progress against these is computed live from existing watch/list data (see
 * `compute.ts`), not stored anywhere: there's no XP or persisted "unlocked" row, so a
 * badge's state is always exactly what the underlying history says it is right now.
 *
 * Two categories: Movies & Shows and Music, mirroring what Reeler actually tracks.
 * Deliberately excludes anything needing data Reeler doesn't have yet — reviews,
 * comments, a "to watch" list with per-item status, country/language metadata, a
 * following/social graph, or a quiz feature. See DESIGN.md for the full list of what
 * was left out and why.
 */

export type BadgeCategory = 'movies_shows' | 'music';

export type BadgeMetric =
	| 'episodesWatched'
	| 'moviesWatched'
	| 'showsFinished'
	| 'hoursWatched'
	| 'watchStreakDays'
	| 'genresExplored'
	| 'rewatchedEpisodes'
	| 'bingeDayEpisodes'
	| 'listsCreated'
	| 'tracksPlayed'
	| 'albumsPlayed'
	| 'artistsExplored'
	| 'musicGenresExplored'
	| 'musicHoursListened'
	| 'listenStreakDays'
	| 'repeatedTracks'
	| 'bingeDayTracks'
	| 'albumsCompleted';

/** One of the hand-drawn icons in `BadgeIcon.svelte`, keyed by name rather than inline
 *  markup so every badge card renders through the same trusted, checked-in SVGs. */
export type BadgeIconName =
	| 'tv'
	| 'clapperboard'
	| 'flag'
	| 'clock'
	| 'flame'
	| 'compass'
	| 'repeat'
	| 'moon'
	| 'list'
	| 'musicNote'
	| 'disc'
	| 'headphones'
	| 'zap'
	| 'checkCircle';

export interface BadgeDef {
	id: string;
	name: string;
	description: string;
	category: BadgeCategory;
	metric: BadgeMetric;
	/** Ascending unit thresholds, one per tier — 10 tiers per badge, e.g.
	 *  `[10, 50, 100, 500, 1000, 2500, 5000, 10000, 25000, 50000]`. */
	tiers: number[];
	icon: BadgeIconName;
}

export const BADGES: BadgeDef[] = [
	// Movies & Shows
	{
		id: 'episodes',
		name: 'Marathoner',
		description: 'Episodes watched',
		category: 'movies_shows',
		metric: 'episodesWatched',
		tiers: [10, 50, 100, 500, 1000, 2500, 5000, 10000, 25000, 50000],
		icon: 'tv'
	},
	{
		id: 'movies',
		name: 'Cinephile',
		description: 'Movies watched',
		category: 'movies_shows',
		metric: 'moviesWatched',
		tiers: [5, 15, 30, 75, 150, 300, 600, 1200, 2500, 5000],
		icon: 'clapperboard'
	},
	{
		id: 'shows',
		name: 'Finisher',
		description: 'Shows completed',
		category: 'movies_shows',
		metric: 'showsFinished',
		tiers: [1, 3, 5, 10, 20, 35, 50, 75, 100, 150],
		icon: 'flag'
	},
	{
		id: 'hours',
		name: 'Time Sink',
		description: 'Hours watched',
		category: 'movies_shows',
		metric: 'hoursWatched',
		tiers: [10, 25, 50, 100, 250, 500, 1000, 2000, 4000, 8000],
		icon: 'clock'
	},
	{
		id: 'streak',
		name: 'Consistency',
		description: 'Days in a row with a watch',
		category: 'movies_shows',
		metric: 'watchStreakDays',
		tiers: [3, 5, 7, 14, 21, 30, 60, 90, 180, 365],
		icon: 'flame'
	},
	{
		id: 'genres',
		name: 'Explorer',
		description: 'Different genres watched',
		category: 'movies_shows',
		metric: 'genresExplored',
		tiers: [3, 5, 8, 10, 12, 15, 18, 20, 22, 25],
		icon: 'compass'
	},
	{
		id: 'rewatch',
		name: 'Loyal',
		description: 'Episodes watched more than once',
		category: 'movies_shows',
		metric: 'rewatchedEpisodes',
		tiers: [1, 3, 5, 10, 20, 35, 50, 75, 100, 150],
		icon: 'repeat'
	},
	{
		id: 'binge_day',
		name: 'Binge-Watcher',
		description: 'Episodes watched in a single day',
		category: 'movies_shows',
		metric: 'bingeDayEpisodes',
		tiers: [3, 5, 8, 12, 16, 20, 25, 30, 40, 50],
		icon: 'moon'
	},
	{
		id: 'lists',
		name: 'Curator',
		description: 'Lists created',
		category: 'movies_shows',
		metric: 'listsCreated',
		tiers: [1, 2, 3, 5, 8, 12, 16, 20, 25, 30],
		icon: 'list'
	},

	// Music
	{
		id: 'tracks',
		name: 'Needle Drop',
		description: 'Tracks played',
		category: 'music',
		metric: 'tracksPlayed',
		tiers: [10, 50, 100, 500, 1000, 2500, 5000, 10000, 25000, 50000],
		icon: 'musicNote'
	},
	{
		id: 'albums',
		name: 'Album Head',
		description: 'Albums played',
		category: 'music',
		metric: 'albumsPlayed',
		tiers: [5, 15, 30, 75, 150, 300, 600, 1200, 2500, 5000],
		icon: 'disc'
	},
	{
		id: 'artists',
		name: 'Crate Digger',
		description: 'Different artists explored',
		category: 'music',
		metric: 'artistsExplored',
		tiers: [5, 10, 20, 35, 50, 75, 100, 150, 200, 300],
		icon: 'headphones'
	},
	{
		id: 'music_genres',
		name: 'Sound Explorer',
		description: 'Different music genres explored',
		category: 'music',
		metric: 'musicGenresExplored',
		tiers: [3, 5, 8, 10, 12, 15, 18, 20, 22, 25],
		icon: 'compass'
	},
	{
		id: 'music_hours',
		name: 'Deep Listener',
		description: 'Hours of music listened',
		category: 'music',
		metric: 'musicHoursListened',
		tiers: [10, 25, 50, 100, 250, 500, 1000, 2000, 4000, 8000],
		icon: 'clock'
	},
	{
		id: 'music_streak',
		name: 'On a Roll',
		description: 'Days in a row with a listen',
		category: 'music',
		metric: 'listenStreakDays',
		tiers: [3, 5, 7, 14, 21, 30, 60, 90, 180, 365],
		icon: 'flame'
	},
	{
		id: 'on_repeat',
		name: 'On Repeat',
		description: 'Tracks played more than once',
		category: 'music',
		metric: 'repeatedTracks',
		tiers: [1, 3, 5, 10, 20, 35, 50, 75, 100, 150],
		icon: 'repeat'
	},
	{
		id: 'music_binge_day',
		name: 'Playlist Bender',
		description: 'Tracks played in a single day',
		category: 'music',
		metric: 'bingeDayTracks',
		tiers: [10, 20, 35, 50, 75, 100, 150, 200, 300, 500],
		icon: 'zap'
	},
	{
		id: 'album_complete',
		name: 'Album Completionist',
		description: 'Albums played all the way through',
		category: 'music',
		metric: 'albumsCompleted',
		tiers: [1, 3, 5, 10, 20, 35, 50, 75, 100, 150],
		icon: 'checkCircle'
	}
];
