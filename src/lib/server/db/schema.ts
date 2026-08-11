import {
	sqliteTable,
	text,
	integer,
	real,
	uniqueIndex,
	index,
	type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const mediaTypeValues = ['movie', 'show', 'season', 'episode', 'album', 'track'] as const;
export type MediaType = (typeof mediaTypeValues)[number];

export const historySourceValues = ['plex', 'manual'] as const;
export type HistorySource = (typeof historySourceValues)[number];

function id() {
	return text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());
}

function createdAt() {
	return integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date());
}

/** A person using Reeler, optionally linked to a Plex Home user. */
export const users = sqliteTable(
	'users',
	{
		id: id(),
		username: text('username').notNull(),
		/** Plex Home account id (`accountID`), used to attribute history/ratings on a shared server. */
		plexAccountId: text('plex_account_id'),
		isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
		createdAt: createdAt()
	},
	(table) => [uniqueIndex('users_plex_account_id_idx').on(table.plexAccountId)]
);

export type User = typeof users.$inferSelect;

/** A logged-in session, identified by a high-entropy id stored in an httpOnly cookie. */
export const sessions = sqliteTable(
	'sessions',
	{
		id: id(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
		createdAt: createdAt()
	},
	(table) => [index('sessions_user_id_idx').on(table.userId)]
);

/**
 * Canonical media entity, keyed by an external ID (TMDb/TVDb/MusicBrainz) rather than
 * Plex's ratingKey, so history survives a library rebuild or server migration.
 * `parentId` links episodes to shows and tracks to albums.
 */
export const mediaItems = sqliteTable(
	'media_items',
	{
		id: id(),
		type: text('type', { enum: mediaTypeValues }).notNull(),
		title: text('title').notNull(),
		/** Recording artist — set on albums (Plex: an album's own parent is its artist;
		 *  manually-logged: from the MusicBrainz search result). Null for every other type. */
		artist: text('artist'),
		year: integer('year'),
		tmdbId: text('tmdb_id'),
		tvdbId: text('tvdb_id'),
		imdbId: text('imdb_id'),
		musicbrainzId: text('musicbrainz_id'),
		/** Secondary mapping to the source Plex server; absent for manually-logged items. */
		plexRatingKey: text('plex_rating_key'),
		/** For episodes/tracks: links to season/album. For seasons: links to the show. */
		parentId: text('parent_id').references((): AnySQLiteColumn => mediaItems.id),
		/** Set on `season`/`episode` rows — a show's season number, or an episode's within it. */
		seasonNumber: integer('season_number'),
		episodeNumber: integer('episode_number'),
		/** Set on `season` rows — Plex's own episode count for that season. */
		episodeCount: integer('episode_count'),
		/** Network (shows) or studio (movies), from Plex's own `studio` field. */
		studio: text('studio'),
		/** Plex's own critic score (0-10), e.g. Rotten Tomatoes — distinct from a user's own rating. */
		criticRating: real('critic_rating'),
		/** ISO date string (`YYYY-MM-DD`), from Plex's `originallyAvailableAt` — set on episodes. */
		airDate: text('air_date'),
		/** Public poster URL (currently only TMDb, for manually-logged items) — safe to link to directly. */
		artworkUrl: text('artwork_url'),
		/**
		 * Plex's relative thumb path (e.g. `/library/metadata/123/thumb/169...`). Fetching it
		 * requires the admin token, so it's served through our own image proxy rather than
		 * ever being placed in a client-facing `<img src>` directly.
		 */
		plexThumb: text('plex_thumb'),
		/** Public backdrop URL (TMDb) — safe to link to directly, same as artworkUrl. */
		backdropUrl: text('backdrop_url'),
		/** Plex's relative backdrop ("art") path — proxied server-side, same as plexThumb. */
		plexArt: text('plex_art'),
		tagline: text('tagline'),
		summary: text('summary'),
		runtimeMinutes: integer('runtime_minutes'),
		contentRating: text('content_rating'),
		/** JSON-encoded string array, e.g. `["Drama","Western"]` — parsed at render time. */
		genres: text('genres'),
		createdAt: createdAt()
	},
	(table) => [
		index('media_items_tmdb_id_idx').on(table.tmdbId),
		index('media_items_tvdb_id_idx').on(table.tvdbId),
		index('media_items_musicbrainz_id_idx').on(table.musicbrainzId),
		index('media_items_plex_rating_key_idx').on(table.plexRatingKey),
		index('media_items_parent_id_idx').on(table.parentId)
	]
);

export type MediaItem = typeof mediaItems.$inferSelect;

/** A single watch/listen event, sourced from Plex (webhook or backfill) or logged manually. */
export const watchHistory = sqliteTable(
	'watch_history',
	{
		id: id(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id),
		mediaItemId: text('media_item_id')
			.notNull()
			.references(() => mediaItems.id),
		watchedAt: integer('watched_at', { mode: 'timestamp' }).notNull(),
		source: text('source', { enum: historySourceValues }).notNull(),
		progressPercent: integer('progress_percent').notNull().default(100),
		createdAt: createdAt()
	},
	(table) => [
		index('watch_history_user_id_idx').on(table.userId),
		index('watch_history_media_item_id_idx').on(table.mediaItemId)
	]
);

/**
 * One rating per (user, media item). Two-way synced with Plex: a Plex `media.rate`
 * webhook updates this row, and an in-app rating change is written back to Plex's
 * `/:/rate` endpoint.
 */
export const ratings = sqliteTable(
	'ratings',
	{
		id: id(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id),
		mediaItemId: text('media_item_id')
			.notNull()
			.references(() => mediaItems.id),
		/** 0-10, matching Plex's half-star (0-10) scale. */
		value: integer('value').notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [uniqueIndex('ratings_user_media_item_idx').on(table.userId, table.mediaItemId)]
);

export const lists = sqliteTable('lists', {
	id: id(),
	ownerId: text('owner_id')
		.notNull()
		.references(() => users.id),
	name: text('name').notNull(),
	description: text('description'),
	isShared: integer('is_shared', { mode: 'boolean' }).notNull().default(false),
	createdAt: createdAt()
});

export const listItems = sqliteTable(
	'list_items',
	{
		id: id(),
		listId: text('list_id')
			.notNull()
			.references(() => lists.id),
		mediaItemId: text('media_item_id')
			.notNull()
			.references(() => mediaItems.id),
		position: integer('position').notNull().default(0),
		note: text('note'),
		addedAt: createdAt()
	},
	(table) => [index('list_items_list_id_idx').on(table.listId)]
);

/**
 * A cast/crew member, keyed on their TMDb person id. Shared across every credit they
 * have in the library — a person row is created (with just id/name/profile) the first
 * time they show up in some title's credits, and "filled in" (biography, birthday,
 * etc.) lazily, the first time someone actually opens their own page. `detailsFetchedAt`
 * (not just checking whether `biography` is set) distinguishes "never looked up" from
 * "looked up, TMDb just doesn't have a bio for this person" — without it, an obscure
 * crew member with no biography on file would trigger a fresh TMDb call on every visit.
 */
export const people = sqliteTable(
	'people',
	{
		id: id(),
		tmdbId: text('tmdb_id').notNull(),
		name: text('name').notNull(),
		/** Public TMDb CDN URL — safe to link to directly, same as media_items.artworkUrl. */
		profileUrl: text('profile_url'),
		biography: text('biography'),
		/** ISO date string (`YYYY-MM-DD`). */
		birthday: text('birthday'),
		deathday: text('deathday'),
		placeOfBirth: text('place_of_birth'),
		knownForDepartment: text('known_for_department'),
		detailsFetchedAt: integer('details_fetched_at', { mode: 'timestamp' }),
		createdAt: createdAt()
	},
	(table) => [uniqueIndex('people_tmdb_id_idx').on(table.tmdbId)]
);

export type Person = typeof people.$inferSelect;

export const creditRoleValues = ['cast', 'crew'] as const;
export type CreditRole = (typeof creditRoleValues)[number];

/**
 * One (media item, person) credit. `character` is set for cast; `job`/`department` for
 * crew — crew is filtered at fetch time to a handful of key roles (director, writer,
 * producer, ...), not TMDb's full department list, so this stays a "who made this"
 * summary rather than the entire crew roster. Only ever populated lazily, the first
 * time a movie/show's own detail page is viewed (see `getOrFetchCredits`) — never a
 * sync-time or scheduled fetch, to keep the regular library sync fast.
 */
export const credits = sqliteTable(
	'credits',
	{
		id: id(),
		mediaItemId: text('media_item_id')
			.notNull()
			.references(() => mediaItems.id),
		personId: text('person_id')
			.notNull()
			.references(() => people.id),
		role: text('role', { enum: creditRoleValues }).notNull(),
		character: text('character'),
		job: text('job'),
		department: text('department'),
		/** TMDb's own billing/cast order — lower is more prominent. 0 for crew. */
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: createdAt()
	},
	(table) => [
		index('credits_media_item_id_idx').on(table.mediaItemId),
		index('credits_person_id_idx').on(table.personId)
	]
);

export const accentColorValues = [
	'amber',
	'blue',
	'purple',
	'pink',
	'red',
	'green',
	'teal'
] as const;
export type AccentColor = (typeof accentColorValues)[number];

/**
 * Single-row table (`id` is always the literal `'singleton'`) holding the app-wide
 * config editable from the Settings page — Plex connection, metadata-source keys, and
 * display prefs. Every field the Settings page can set is nullable: a null here means
 * "not overridden", and the corresponding env var (if any) is used instead — see
 * `lib/server/settings.ts`. This lets existing `.env`-only deployments keep working
 * unchanged after upgrading, with the Settings page as an optional override layer
 * rather than a hard cutover.
 */
export const appSettings = sqliteTable('app_settings', {
	id: text('id').primaryKey().default('singleton'),
	plexServerUrl: text('plex_server_url'),
	plexToken: text('plex_token'),
	plexWebhookToken: text('plex_webhook_token'),
	plexClientIdentifier: text('plex_client_identifier'),
	tmdbReadAccessToken: text('tmdb_read_access_token'),
	tvdbApiKey: text('tvdb_api_key'),
	accentColor: text('accent_color', { enum: accentColorValues }).notNull().default('amber'),
	twentyFourHourTime: integer('twenty_four_hour_time', { mode: 'boolean' })
		.notNull()
		.default(false),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const usersRelations = relations(users, ({ many }) => ({
	watchHistory: many(watchHistory),
	ratings: many(ratings),
	lists: many(lists),
	sessions: many(sessions)
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, { fields: [sessions.userId], references: [users.id] })
}));

export const mediaItemsRelations = relations(mediaItems, ({ one, many }) => ({
	parent: one(mediaItems, {
		fields: [mediaItems.parentId],
		references: [mediaItems.id]
	}),
	watchHistory: many(watchHistory),
	ratings: many(ratings),
	credits: many(credits)
}));

export const peopleRelations = relations(people, ({ many }) => ({
	credits: many(credits)
}));

export const creditsRelations = relations(credits, ({ one }) => ({
	mediaItem: one(mediaItems, { fields: [credits.mediaItemId], references: [mediaItems.id] }),
	person: one(people, { fields: [credits.personId], references: [people.id] })
}));

export const watchHistoryRelations = relations(watchHistory, ({ one }) => ({
	user: one(users, { fields: [watchHistory.userId], references: [users.id] }),
	mediaItem: one(mediaItems, { fields: [watchHistory.mediaItemId], references: [mediaItems.id] })
}));

export const ratingsRelations = relations(ratings, ({ one }) => ({
	user: one(users, { fields: [ratings.userId], references: [users.id] }),
	mediaItem: one(mediaItems, { fields: [ratings.mediaItemId], references: [mediaItems.id] })
}));

export const listsRelations = relations(lists, ({ one, many }) => ({
	owner: one(users, { fields: [lists.ownerId], references: [users.id] }),
	items: many(listItems)
}));

export const listItemsRelations = relations(listItems, ({ one }) => ({
	list: one(lists, { fields: [listItems.listId], references: [lists.id] }),
	mediaItem: one(mediaItems, { fields: [listItems.mediaItemId], references: [mediaItems.id] })
}));
