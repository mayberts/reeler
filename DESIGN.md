# Reeler — Design Scope

Status: **scoping only, nothing implemented yet.**

## Goals

- Sync library metadata from a self-hosted Plex Media Server (movies, TV,
  music).
- Track watch history per user, in near-real-time, sourced from Plex.
- Ratings, kept in sync both ways between Plex and the app.
- Personal and shared lists (watchlists, curated lists, etc.).
- Multi-user / household support, mapped to Plex Home users.
- Allow logging items _not_ in the Plex library (theatrical releases, other
  streaming services) via metadata search.
- Fast and reliable: the app should feel instant, and never silently lose a
  watch event.
- Self-hosted via Docker, deployable on Unraid.

## Non-goals (v1)

- Not a media server — no streaming, transcoding, or file management.
- Not a recommendation/discovery engine.
- Not trying to replace Plex's own UI for browsing/playback.

## Architecture

### Components

1. **Web app** — UI + API routes in a single deployable (SvelteKit).
2. **Sync engine** — background scheduler + webhook receiver, reconciles
   Plex state into Reeler's own data model.
3. **Datastore** — SQLite in WAL mode via Drizzle ORM. Single file, lives in
   a `/config` volume for easy backup. Swappable to Postgres later if scale
   ever demands it (Drizzle supports both), but unnecessary at
   household/personal scale.
4. **Metadata enrichment** — TMDb (movies/TV) and MusicBrainz/Last.fm
   (music), used for non-Plex manual entries and to normalize external IDs.

### Plex integration

Three complementary paths, since Plex doesn't expose one API that covers
everything:

- **Webhooks (primary, requires Plex Pass — confirmed available)**:
  `media.scrobble`, `media.rate`, `media.play` / `pause` / `stop` posted to
  an endpoint Reeler exposes. This is the real-time path for watch events
  and rating changes.
- **Polling backstop**: periodic reconciliation against
  `/status/sessions/history/all`, to catch anything a dropped/missed webhook
  would otherwise lose. Not the primary mechanism — insurance.
- **Library metadata sync**: periodic pull of `/library/sections` for
  movies/shows/music. Media items are keyed by **external ID** (TMDb/TVDb/
  MusicBrainz), with Plex's `ratingKey` stored only as a secondary mapping —
  this way history survives a library rebuild or server migration.

**Multi-user attribution**: Plex Home users each appear as a distinct
`accountID` in session/history data. The admin token can query history
filtered by `accountID`, which is how per-person watch history is split out
on a shared server. Account linking uses Plex's OAuth PIN flow; the admin
maps each linked Reeler account to its Plex Home identity.

### Data model (sketch)

- `users` — local account, optionally linked to a Plex Home user id.
- `media_items` — canonical entity keyed by external ID (tmdb/tvdb/
  musicbrainz), with an optional `plex_rating_key` mapping.
- `watch_history` — user, media item, timestamp, source (`plex` |
  `manual`), completion %.
- `ratings` — user, media item, value. Two-way synced with Plex (see
  below).
- `lists` / `list_items` — personal or shared, ordered, with notes.

Manually-logged (non-Plex) items reuse `media_items` with no
`plex_rating_key`, resolved via TMDb/MusicBrainz search at add-time.

### Ratings: two-way sync

One rating value per (user, media item), editable from either surface:

- Rate in Plex → webhook (`media.rate`) updates the value in Reeler.
- Rate in Reeler → Reeler calls Plex's `/:/rate` endpoint to write it back.

This avoids the "Plex says 4★, Reeler says 7/10" drift/confusion problem
that a fully independent rating scale would introduce.

### Performance & reliability

- SQLite WAL mode handles concurrent reads/writes fine at this scale.
- All Plex sync work runs in a background queue — the UI is never blocked
  waiting on a Plex API call.
- Webhook ingestion is durable (queued + retried), so a dropped delivery
  doesn't silently lose a watch event — the polling reconciliation exists
  specifically as a backstop for this.
- Since the app will likely run on the same host/LAN as the Plex server,
  API round-trips are cheap, so polling can run relatively aggressively
  without meaningful load.

### Deployment

- Single Docker image / docker-compose stack, `/config` volume for the
  SQLite DB. Deployed in practice via Unraid's Compose Manager plugin.
- No Community Apps template planned — Compose Manager already covers
  this deployment, a CA template would just be a second thing to keep in
  sync with no one asking for it.
- The image is built and published to GitHub Container Registry
  (`ghcr.io/mayberts/reeler`) by `.github/workflows/docker-publish.yml`
  on every push to `main` (tagged `latest` and by short commit SHA) and
  on version tags (`v*.*.*`, tagged by semver). `docker-compose.yml`
  pulls that image rather than building from source, so updating on
  Unraid is `docker compose pull && docker compose up -d` — no compiling
  on the Unraid box itself, and no local clone or git-URL build context
  needed either. A GHCR package publishes **private** by default even
  from a public repo — after the workflow's first run, its visibility
  needs to be set to public once (repo → Packages → reeler → Package
  settings → Change visibility), or Unraid needs `docker login ghcr.io`
  credentials to pull it. Building locally (`build: .`) still works as a
  fallback if preferred.

### Poster art

Plex posters require the admin token to fetch, so they're never linked to
directly from the client (`<img src>` pointed at Plex would leak the token
to anyone who views page source, browser history, or a screenshot).
Instead `media_items.plexThumb` stores Plex's relative thumb path, and
`/api/media/[id]/poster` fetches it server-side and streams the bytes
back — the token stays server-side. TMDb posters (`artworkUrl`) are
already public, so those just redirect to TMDb's own CDN. Backdrops
(`plexArt`/`backdropUrl`, served via `/api/media/[id]/backdrop`) follow
the identical pattern.

### Detail pages

Per-title pages at `/media/[id]` (movies/shows/episodes/tracks/albums
share one route, rendering conditionally by type) — backdrop hero, poster,
tagline/genres/runtime/content rating, synopsis, and action pills (mark
watched, rate, add to list). Deliberately doesn't include Radarr/Sonarr-style
acquisition-tool integration or streaming "where to watch" availability —
those are a different category of app (request/download management) from
what Reeler does (tracking), and "where to watch" would add a new paid
third-party API dependency for comparatively low value here.

Richer metadata (tagline, summary, runtime, content rating, genres) comes
free from Plex — the same `/library/sections/.../all` and history/webhook
calls already in use return it, no extra requests needed. For
manually-logged (TMDb) items it costs one extra API call, made at log
time rather than lazily on page view, so the detail page never needs to
reach out to TMDb itself.

### Browse-grid pages

`/movies`, `/shows`, `/music` — poster-grid views of the full synced
library, filtered by `media_items.type` (`music` currently means
`album`; tracks aren't shown at this level, same reasoning as episodes
not getting their own top-level browse page). Each shows a total count,
a title search box, and a sort control (title/year/recently added), and
reuses `MediaCard`/`.card-grid` rather than introducing a new visual
style. `/music` uses square (1:1) artwork instead of the 2:3 poster
ratio the other two use — matching how Plex itself displays album
covers. Cards get a small checkmark badge when the signed-in user has a
`watch_history` row for that item — a cheap single follow-up query
against just the rendered page, not a join, since it only needs to cover
what's on screen. No pagination yet; the existing card-grid pages
(dashboard, history, etc.) don't paginate either, and per-type counts
(low thousands, even for a large music library) are small enough that
it isn't a problem yet.

"Full synced library" for `/music` originally meant "every album
that's actually been played," not Plex's whole album catalog — see
below, revised after a real deployment made the gap obvious (4,588 vs.
1,053).

### Music: sparse payload bug (fixed)

Real-world Plex history/webhook entries for tracks turned out to look
like `{ title, ratingKey, type, parentTitle, grandparentTitle, viewedAt,
... }` — the album's _name_ (`parentTitle`) is always there as plain
text, but the album's `ratingKey` (`parentRatingKey`) never is. The
original album/track linking logic required both, so it silently never
fired: tracks got created (from webhook scrobbles, which do carry a real
`ratingKey`) but no album row ever did, and `parent_id` stayed null on
every track — confirmed against production, which had 3,061 orphaned
track rows and zero albums.

Fixed by adding `getMetadata(ratingKey)` (`/library/metadata/{ratingKey}`)
and calling it whenever a track/album payload looks sparse (no `thumb`,
used as the signal) but has a `ratingKey` — the canonical metadata
response carries `parentRatingKey`, `thumb`, `duration`, and `genres`
that the history/webhook payload leaves out. This also fixes missing
poster art and runtime for music, which had the same root cause.
Pre-existing orphaned tracks needed a separate repair, since replaying
Plex's history endpoint for them hits the same sparse payload (it
doesn't even carry `ratingKey` for tracks) — `repairOrphanedTrackParents()`
instead re-resolves each orphaned track directly by its already-stored
`plexRatingKey`, and runs automatically as part of "Sync now".

### Music: albums now pre-synced

Originally music was lazy-only end to end (see phase 3 below as
shipped) — no album existed until something in it had actually been
played. That made sense in the abstract ("tracking" is about what's
been listened to) but read as broken in practice once `/music` sat
next to `/movies` and `/shows`, which do show the full library: a real
deployment had 4,588 albums in Plex and only 1,053 in Reeler, and there
was no way to tell "haven't played it" apart from "sync is missing
something" from the UI alone.

`syncLibrary()` now includes artist-type sections, requesting Plex's
flattened album listing (`/library/sections/{key}/all?type=9` — Plex's
metadata type 9 is "album") the same way a show section's episodes
could be flattened with `type=4`. This mirrors the movie/show split
exactly: albums (like movies/shows) are worth browsing before you've
listened to anything, tracks (like episodes) aren't worth mirroring up
front — they're still created lazily from play history/webhooks only.

### UI restyle: Scrob-inspired

Reworked the visual language after comparing against [Scrob](https://github.com/ellite/scrob)
(an open-source self-hosted tracker with a similar scope, forked as
`mayberts/scrob` for reference) — Reeler's data model, sync engine, and
Plex-only focus stay as-is, this only changes how it looks:

- Dark-first zinc palette (`--surface`/`--surface-raised`/`--border`
  tokens now mirror Scrob's zinc-950/900/800 scale) with matching light
  values, still driven by `light-dark()` — no separate theme toggle.
  Kept Reeler's amber accent (`--accent: #e5a00d`) rather than adopting
  Scrob's blue default; it already read as a deliberate nod to Plex's
  own brand color.
- Bigger border radius (`--radius: 1rem`) and a `MediaCard` rebuilt
  around Scrob's card: bordered, hover lift + accent-colored border
  glow, poster zoom on hover, gradient-free flat info footer with a
  small uppercase type badge (movie/show/album/etc — shown wherever a
  grid mixes types: dashboard, history, ratings, lists; omitted on the
  single-type `/movies`/`/shows`/`/music` grids where it'd be
  redundant).
- `section-headline` utility (bold text + a small colored accent bar)
  applied to the app's recurring section headers (Recent activity,
  Overview, Most watched, etc.), matching Scrob's typography system.
- The detail page's action pills became a small colored action bar
  (green/watched, amber/rated) with inline stroke icons, echoing
  Scrob's `CardActionBar` color coding — adapted rather than copied,
  since Reeler's actions need inline controls (a rating number input, a
  list `<select>`) that Scrob's simpler toggle buttons don't.

Verified visually with Playwright screenshots (dashboard, `/movies`,
and a detail page, both color schemes) against seeded sample data,
alongside the usual typecheck/lint/build pass.

### UI restyle, round two: closer to a component port

The first pass (above) was a "look and feel" restyle — palette, card
styling, typography — that kept Reeler's own page structure. Told this
undersold what "copy the UI from Scrob" meant, so this round ports the
structural pieces that were still missing, each adapted to what Reeler
actually has (no Jellyfin/Emby/Nuvio/Stremio, no Trakt/Simkl/MDBList,
no TMDb "Explore" discovery browsing — Scrob components tied to those
don't have a Reeler equivalent to port to):

- **Persistent per-card action bar.** `MediaCard` now has an always-visible
  Watched/Lists button row under the poster (Scrob's `CardActionBar`),
  not just a corner badge. Clicking posts to two new JSON endpoints —
  `POST /api/media/[id]/watch` and `POST /api/media/[id]/lists` — with
  optimistic client-side state, so a card updates without navigating to
  the detail page. No "Collected" button: Reeler has no concept
  separate from "is it in the library," so there's nothing for it to
  toggle. No "unwatch": Reeler's `watch_history` is an append-only log
  mirroring Plex's own scrobble history, not a boolean flag, so
  "Watched" always adds a manual watch rather than toggling one off —
  same one-way semantics the detail page's button already had.
- **Real filters and pagination.** `browseMediaByType()` now takes
  `genres`, `watched`, and `page`, backed by real `WHERE`/`LIMIT`/`OFFSET`
  clauses rather than loading everything. The filter panel is a native
  `<details>` disclosure (checkboxes for genre, radios for watched
  status) instead of Scrob's animated JS modal — same functionality,
  without a hand-rolled overlay/animation system. Genre options are
  derived from actual data (`listAvailableGenres()`) rather than a
  hardcoded TMDb genre list, since Reeler's genres come from whatever
  tags exist in the user's own Plex library. Pagination buttons live
  inside the same `<form method="GET">` as the filters (native
  `name="page" value="N"` submit buttons) rather than `<a href>` links —
  matching this codebase's existing convention of GET forms for
  parameterized navigation, and sidestepping the need to hand-build
  query strings in JS.
- **Deferred, not done:** the History/List row-card reskins
  (`HistoryCard`/`ListCard`) and a mobile bottom nav bar. Flagged as
  still open rather than silently skipped.

Verified with a full Playwright pass against seeded data (35 movies,
mixed genres, a mix of watched/unwatched, a real list): genre filter
narrowed 35→9 results correctly, "Clear all" reset it, pagination
advanced pages via the query string, and clicking a card's Watched/Lists
buttons produced real `watch_history`/`list_items` rows — confirmed by
querying the DB directly after the clicks, not just checking the UI
state.

### Full Scrob audit: closing the remaining UI gaps

Round two above deferred the History/List row-card reskins and a mobile
bottom nav. Rather than keep cherry-picking piece by piece and missing
things, this round did a full page-by-page audit of every Scrob
component/page against Reeler's equivalent and closed every applicable
gap in one pass:

- **Mobile bottom nav.** A fixed bottom nav bar (Dashboard/Movies/Shows/
  Music/History/Lists, icon + label) now shows below a 46rem viewport,
  replacing the desktop header nav — matching Scrob's `Base.astro`
  mobile nav. Uses `env(safe-area-inset-bottom)` padding for notched
  phones; `<main>` gets bottom padding so content doesn't sit under it.
- **`/lists` index redesign.** Replaced the old plain list-of-links with
  `ListCard` rows (Scrob's `ListCard.astro`): up to 3 stacked poster
  thumbnails per list, a real item count (not just "N items" text), and
  a placeholder icon for empty lists. `getVisibleLists()` now fetches
  both a per-list preview (`limit: 3`, ordered by position) and a true
  total count via a separate grouped query, since the preview cap and
  the count need different queries.
- **List-item removal moved onto the card itself.** `MediaCard` gained
  an `overlay` prop (a Svelte 5 snippet rendered absolutely-positioned
  over the top-right corner of the poster, as a sibling of the poster
  `<a>` rather than nested inside it, to keep it out of the anchor's
  interactive content). `/lists/[id]` now passes a small "✕" remove
  form through it instead of a separate button row below each card —
  matching how Scrob overlays its own remove control on `ListCard`.
- **`/history` redesign.** Replaced the flat table with `HistoryRow`
  cards (Scrob's `HistoryCard.astro`) grouped under date headings
  ("Monday, August 10, 2026"), a type-filter pill tab bar (All/Movies/
  Shows/Music), a rating badge and source tag (Plex/manual) per row,
  a delete button per entry (new `removeEntry` action, scoped to the
  signed-in user), and real pagination — all backed by a rewritten
  server query (`innerJoin` on `media_items`, `leftJoin` on the
  signed-in user's `ratings` row, `LIMIT`/`OFFSET`) replacing the old
  load-everything-then-filter-in-memory approach.
- **Dashboard "Recently added" rows.** Two horizontal-scroll rows
  (movies, shows — 15 each, newest first) below the sync-result
  banner, matching Scrob's dashboard recent-additions rails. Music
  omitted here since albums/tracks don't carry the same "just landed
  in the library" signal movies/shows do (see music pre-sync notes
  above).

**Explicitly out of scope, flagged rather than silently dropped** —
each of these needs a backend capability Reeler doesn't have and that
doesn't fit its Plex-only, non-social scope: cast/crew credits, TMDb
collections/franchise groupings, in-app video playback, comments,
recommendations/trending/discover/next-up/continue-watching rails
(need a TMDb discovery API integration or Plex session-position
tracking, neither of which exist yet), multi-user social features
(public/friends-only list privacy, community lists, user profiles),
Radarr/Sonarr import (dropped earlier in the project, see history),
and Scrob's full analytics suite beyond Reeler's existing stats page
(period navigation, weekday chart, watch-time chart, rating-distribution
histogram, per-collection pie charts). Possible future follow-up, not
this round.

Verified with a full Playwright pass against seeded data (10 recently-
added movies/shows, 2 lists — one empty enough to hit the placeholder
path, one with a preview item, 3 history entries across 2 days with one
manual entry and one rating) plus the usual typecheck/lint/build: dashboard
recent-additions rows, lists index card/placeholder rendering, list-detail
overlay remove button, history date grouping, type-filter tabs, and
entry deletion (3→2 rows) all confirmed working by screenshot and
direct DB queries.

### Detail page: full-bleed hero, external links, seasons

Comparing a real detail page side-by-side with Scrob's showed the gap
had moved: `/media/[id]` was still the boxed, sparse hero from the
original detail-page phase, missing several things Scrob shows for a
TV show. Closed what fit Reeler's existing data plus one deliberate new
sync capability, and explicitly deferred the one item that would've
needed a new external integration:

- **Seasons pre-sync (new sync capability).** Episodes stay lazy (same
  as before — an episode list is huge and "tracking" is about what's
  been watched, not mirroring the catalog), but a show's _seasons_ are
  few enough, and useful enough to browse before anything's been
  watched, to pre-sync like the show itself — the same reasoning that
  already applied to albums. `syncLibrary()` now makes a second,
  `type: '3'`-filtered request per show section (same trick `type: '9'`
  already used for albums) and upserts every season as its own
  `media_items` row (`type: 'season'`, `parentId` → the show,
  `seasonNumber`/`episodeCount` from Plex's own `index`/`leafCount`).
  A lazily-created episode now links to its pre-synced season the same
  way a track links to its album.
- **Richer meta row and external links.** Critic score badge (Plex's
  own `rating` field — distinct from a user's own rating), studio/
  network name, and a season count for shows. IMDb/TMDb/TVDB badges
  link out using ids Reeler already extracts from Plex's `Guid` array
  (added IMDb extraction alongside the existing TMDb/TVDb parsing).
- **Full-bleed hero + seasons grid.** The hero no longer centers its
  content in a narrower inner column — it now spans the same width as
  the rest of the page, with a breadcrumb back to the parent show/album
  above the poster for episode/season/track pages. Shows with synced
  seasons get a poster-grid section below the overview, matching
  Scrob's seasons row; clicking a season poster opens its own (fairly
  minimal, since episodes still aren't pre-synced) detail page.
- **Deliberately skipped: "Where to watch" streaming availability.**
  Unlike everything else above, this isn't closable with data Reeler
  already has — it needs a new call to TMDb's watch-providers endpoint
  (region-specific, nothing in the codebase calls it today). Flagged to
  the user rather than silently built or silently dropped; skipped for
  this round.

Building the seasons pre-sync surfaced a real bug via the DB smoke
test, not just a gap: a season's parent-linking stub upsert (creating/
finding its parent show mid-sync) was re-upserting the _already fully
synced_ show with stub data, and `tmdbId`/`tvdbId` didn't fall back to
the existing row the way every other enrichable field already did —
so a show's external ids were getting silently nulled out the moment
its seasons synced. Fixed by adding the same `?? existing?.field ??
null` fallback those two fields were missing (`year` had the identical
gap, fixed the same way).

Verified with a mock Plex server exercising the real sync path (not
just seeded rows) — a show plus two seasons ("Specials", "Season 1")
with studio/critic-rating/content-rating/tmdb+tvdb+imdb ids — confirming
via direct DB query that the season pre-sync, parent-linking, and the
tmdbId/tvdbId fix all work end-to-end, then a Playwright pass over the
resulting detail page confirming the seasons grid, external link
badges, critic-rating badge, and studio/content-rating meta all render.

### Season pages: full episode lists

A season page only had a bare poster grid — no way to see what's
actually in a season without watching something first. Fixed by taking
the seasons pre-sync one level further:

- **Episodes now pre-sync too**, not just seasons. `syncLibrary()` makes
  a third per-show-section request (`type: '4'`, the same trick used
  for seasons/albums) and upserts every episode as its own row —
  reusing the episode→season parent-linking that already existed for
  the lazy-creation path (a webhook/history entry for a show that
  predates its own library sync still works the same way it always
  did). Tracks are the one thing still lazy-only; a show's episode list
  is exactly what a "browse this season" view needs up front, the same
  way seasons themselves already were, but a music library's track
  list remains too large relative to what's worth mirroring.
- **New `air_date` column** (Plex's `originallyAvailableAt`), needed to
  show each episode's air date in its row — nothing else on the detail
  page used a date-only field before this.
- **`EpisodeRow` component**: thumbnail, episode number + title, air
  date, summary, runtime + a "View details" link to the episode's own
  `/media/[id]` page, a critic-rating badge, and a Watched/Lists action
  bar (the same optimistic-update pattern `MediaCard` already uses,
  adapted to a horizontal row instead of a poster card). A season page
  now loads its episodes plus one bulk query for which of them the
  signed-in user has already watched — avoiding an N+1 per-episode
  watched-status lookup.
- **Not added: a "Collected" toggle.** Scrob's episode cards have one;
  Reeler has no concept separate from "is it in the library" (true for
  every pre-synced episode by definition), so there's nothing for it to
  toggle — same reasoning that already ruled it out for `MediaCard`.

This is a real jump in what gets pre-synced — every episode of every
show, not just seasons — flagged here rather than silently absorbed
into "closing a gap," since it changes what a sync actually costs on a
large library. Verified against a mock Plex server (a season with 2
episodes, full metadata) confirming via direct DB query that episode
pre-sync and season-linking work end-to-end, then a Playwright pass
over the resulting season page confirming the episode list renders
(titles, air dates, summaries, runtimes, ratings) and that marking an
episode watched updates that episode's own state without touching the
season's.

## Roadmap

1. ✅ Plex OAuth account linking, single-server library sync (movies + TV),
   watch-history backfill, webhook receiver. Ratings persistence (one-way,
   Plex → Reeler, on `media.rate` webhook) also landed here since the
   webhook handler needed it anyway; the write-back-to-Plex half of the
   two-way sync is still phase 2 work.
2. ✅ Rating write-back to Plex (two-way sync is now complete both
   directions) and personal/shared lists (create, add/remove items,
   ownership-scoped visibility). Multi-user mapping is still just
   auto-linking on first Plex sign-in — no admin-approval gate yet, see
   open questions.
3. ✅ Music tracking and manual/non-Plex logging. Albums are pre-synced
   from the library like movies/shows (see Deployment/Browse-grid pages
   below — originally shipped as lazy-only, revised after a real
   library showed the gap: 4,588 albums in Plex vs. 1,053 that had
   actually been played); tracks stay lazy, created from play
   history/webhooks the same way episodes are, since a track list isn't
   worth mirroring up front just to track what's been listened to.
   Manual logging searches TMDb (movies/TV only — MusicBrainz/Last.fm
   for manually-logged music is still open, see below) and is optional:
   the app runs fine with no `TMDB_API_KEY` set, that section of the UI
   just says so instead of the search box.
4. ✅ Stats page: hero tiles (total watches, unique titles, ratings given,
   average rating), a watch-count breakdown by media type, a 12-month
   activity bar chart, and top-watched/top-rated lists. (Unraid Community
   Apps packaging dropped — not needed, see Deployment above.)

All four original roadmap phases are done. Nothing currently queued —
next work should come from actual usage, not a pre-written plan.

## Open questions

- Final project name (currently "Reeler", working title only).
- MusicBrainz/Last.fm choice for manually-logging music specifically
  (TMDb doesn't cover music) is still unresolved — not needed yet since
  manual logging only covers movies/TV so far.
- ~~Whether household member linking needs explicit admin approval~~ —
  resolved for now: any Plex account that completes the OAuth sign-in
  auto-links to a new Reeler account, first one in becomes admin. No
  approval gate yet; revisit if that's too open for a shared server.
