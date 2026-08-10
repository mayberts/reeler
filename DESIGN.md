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

### Sync performance: WAL mode + one transaction per sync

The episode pre-sync above made a pre-existing performance problem
impossible to ignore: `syncLibrary()` never actually turned on WAL mode
(the original scoping doc claimed it did — it didn't) and wrote one row
at a time with no explicit transaction, so every single insert/update
was its own implicit transaction, each paying a full disk sync. That's
fine for a few hundred rows; it isn't once a sync includes every episode
of every show.

Fixed two ways, both applied at once since they compound:

- **`journal_mode = WAL` + `synchronous = NORMAL`** pragmas set on the
  SQLite connection at startup. WAL lets reads and writes stop blocking
  each other and checkpoints in batches instead of fsyncing every
  commit; `NORMAL` is the standard, safe pairing with WAL (only an
  OS-level crash, not an app crash, could lose the most recent commit).
- **`syncLibrary()` split into a fetch phase and a write phase.** Every
  Plex HTTP request now happens first, collecting plain item lists;
  then every upsert runs inside a single `BEGIN`/`COMMIT` instead of
  each getting its own. `db.transaction()` couldn't be used for this —
  better-sqlite3's transaction wrapper requires a fully synchronous
  callback and throws if it returns a promise, and the upsert loop is
  async — so this uses raw `BEGIN`/`COMMIT`/`ROLLBACK` statements on
  the underlying connection instead, which has no such restriction and
  produces the identical commit-boundary behavior.

Verified with a before/after timing test against the same mock-Plex
dataset (302 items: 1 show, 1 season, 300 episodes) — temporarily
reverted to the pre-fix code, timed a re-sync, restored the fix, timed
it again, same data both times. ~0.96s → ~0.30s, roughly 3x, in this
sandboxed environment; the gap should be considerably larger on a real
Unraid array, where each fsync this eliminates costs more than it does
here. Confirmed via direct DB query that `journal_mode` reports `wal`
and all 302 rows land correctly.

### Detail page hero: contrast fix

A real screenshot showed the hero's title/tagline/meta-row badges
nearly unreadable against a bright, detailed backdrop image — a bug,
not a scope gap. Root cause was two-fold:

- **Half the meta-row items had no chip background.** Year, runtime,
  season count, and studio were plain colored text with nothing behind
  them; only content rating and the two rating badges used the bordered
  `.badge` chip look. Fixed by giving every meta-row item the same
  chip treatment.
- **The scrim only darkened top/bottom, not left-to-right.** A
  vertical-only gradient can't guarantee contrast at the exact height
  text happens to sit at — a bright patch of the image right behind the
  title reads straight through a modest vertical fade. Added a
  horizontal component (opaque behind the poster/text column, fading
  out toward the right so the image still shows through there) and
  fixed the vertical gradient's shape, which had been dipping back
  toward transparent at almost exactly the height the title/meta-row
  sit — a self-inflicted second problem on top of the missing
  horizontal darkening.

Even after both fixes, an especially bright/busy backdrop image could
still marginally wash out the title and tagline — gradient tuning alone
can't guarantee contrast against an arbitrary image. Closed the gap for
good with a translucent panel behind the actual text content itself
(title through the action bar), on top of the gradient rather than
instead of it, so legibility no longer depends on guessing what a given
show's backdrop art looks like. `.badge`/`.ext-badge` also got their
own solid backgrounds for the same reason, and the title/tagline got a
`text-shadow` as a second line of defense.

Verified by generating a deliberately worst-case synthetic backdrop
(a bright, busy diagonal-stripe pattern — harder to read against than
any real cinematic still) and screenshotting the real fix against it in
both themes: title, tagline, every meta-row badge, external-link
badges, and the action bar all legible. Confirmed the season/episode
pages (which share this component) still render without error.

### Hero fix, round two: the panel was covering the whole image, and dark mode was never actually dark

A real screenshot of the fix above showed an ugly grey box sitting over
almost the entire backdrop image, and a dark, moody backdrop rendering
washed-out and pale rather than dark. Two separate bugs, not one:

- **The translucent text panel was sized to the whole hero, not the
  text.** It lived on `.hero-text`, which has `flex: 1` inside the
  `.hero-body` flex row — so it stretches to fill _all_ remaining width
  after the poster, not just the width of its own content. The
  "panel behind the text" from the previous fix was therefore a panel
  behind almost the entire image. Removed the panel; bounded
  `.hero-text` to a `max-width` instead so it hugs its content, keeps
  the backdrop image dominant on the right (matching the reference
  look), and widened the scrim's opaque zone to actually match where
  the now-bounded text column sits.
- **Dark mode was never applying to the scrim.** The scrim's dark/light
  split used a `:root:not([data-theme='dark'])` selector — but this app
  has no `data-theme` attribute anywhere (it themes entirely off
  `prefers-color-scheme` via `light-dark()`, see `app.css`), so that
  selector always matched and permanently forced the _light_ variant
  regardless of actual color scheme. A dark, moody backdrop under a
  white-tinted overlay is exactly the washed-out look the original bug
  report showed — this was likely the real root cause all along, not
  just the gradient shape. Fixed by using `light-dark()` per gradient
  stop instead, consistent with how the rest of the app themes; grepped
  for the same broken pattern elsewhere and confirmed this was the only
  occurrence.

Also bumped the hero's overall size (taller padding, larger poster) to
sit closer to the reference proportions.

Verified against both a dark/moody synthetic backdrop and the earlier
bright one, in an actually-dark-mode-emulated browser context this
time (confirmed via a direct byte comparison that the correct image
was served, ruling out a test-fixture mixup) — dark backdrop now
renders properly dark with no grey box, bright backdrop still fully
legible. Typecheck/lint/build clean.

### Watch-history backfill was silently capped at one page

A side-by-side comparison against a reference app (Scrob) with the
same real Plex library showed most of the catalog marked unwatched in
Reeler despite actually being watched — only a handful of the most
recently-watched titles came through correctly.

Root cause: `getWatchHistory()` (`src/lib/server/plex/client.ts`) hit
`/status/sessions/history/all` with no pagination params at all, and
`backfillWatchHistory()` (`src/lib/server/sync/history.ts`) only ever
made that one request. Unlike `/library/sections/.../all` — which Plex
Media Server returns in full, unpaginated, so library sync was never
affected — `/status/sessions/history/all` is a capped recent-activity
feed. Omitting `X-Plex-Container-Start`/`Size` gets Plex's small
default page of the _most recent_ entries, sorted by `viewedAt`
descending, with everything older silently dropped. That's exactly the
pattern in the screenshots: a few recently-watched titles synced
correctly, the rest of a long-since-watched back catalog never did.

Fixed by having `getWatchHistory()` accept `containerStart`/
`containerSize`, and `backfillWatchHistory()` loop through pages (200
at a time) until Plex returns a page shorter than the page size,
accumulating results across all of them. Confirmed
`backfillWatchHistory` is the only caller of `getWatchHistory` in the
codebase, so this fixes every path that pulls history: initial
backfill, the dashboard's manual sync trigger, and the polling
backstop.

Verified with a mock Plex server serving 250 history entries (more
than one page) — confirmed via the mock's request log that the real
app made two requests (`start=0 size=200`, then `start=200 size=200`)
and all 250 rows landed in `watch_history`, not just the first 200.
Re-ran the same sync a second time to confirm it stays idempotent (row
count unchanged, no duplicates). Typecheck/lint/build clean.

### Watched status can also be missing from the history log entirely — not just paginated away

After a real redeploy (confirmed: `docker compose pull && up -d`, not
just an in-app sync) and a fresh sync, the pagination fix above wasn't
enough — most of a 1,358-movie library was still showing unwatched in
Reeler despite a reference app with the same Plex library showing it
watched. So the history log itself, even paginated through in full,
didn't contain most of these watches — a different problem than the
one just fixed.

Plex tracks "watched" two independent ways: the `/status/sessions/
history/all` event log (one row per playback), and a permanent
per-item `viewCount`/`lastViewedAt` on the item's own metadata
(returned by the ordinary library listing, `/library/sections/.../
all`). Reeler only ever read the former. The event log has real gaps
that have nothing to do with pagination: a library re-match/re-scan
can give an item a new internal id, orphaning its old history-log
rows, and anything watched before scrobble/webhook tracking was set up
was simply never logged. `viewCount` isn't affected by either — Plex
keeps it against the item permanently regardless of (re)matching.

Added `viewCount`/`lastViewedAt` to `PlexMetadataItem` and a new
`applyLibraryViewCounts()` (`src/lib/server/sync/history.ts`), called
from `syncLibrary()` (`src/lib/server/sync/library.ts`) using data
already fetched during the normal library pass — no extra Plex
requests. For each item with `viewCount > 0`, it adds a `watch_history`
row only if the user has _zero_ existing rows for that item; a real
history-log entry (accurate timestamp, already present) is always left
alone and never duplicated.

Gated to the Plex Home owner/admin account only (`plexAccountId ===
'1'`, Plex's own convention for the server-owner's local account id).
`viewCount` from a single admin-token query reflects that token's own
account, not each individual Plex Home member's — applying it
indiscriminately to every linked user would misattribute the owner's
watch history onto other household members. Other linked users still
get accurate (if less complete) history from the event-log path alone.

Verified with a mock Plex server: 300 movies all with `viewCount: 1`,
but only the most recent 20 present in the history log (simulating the
orphaned/gap scenario). Two linked users — one with `plexAccountId:
'1'` (owner), one `'2'` (not owner). Confirmed via direct DB query:
owner ends up with all 300 `watch_history` rows (280 repaired from
`viewCount`, 20 from the real log, zero duplicates — 300 distinct
media items total, matching exactly), while the non-owner account gets
only the 20 real log entries and _zero_ `viewCount`-derived rows,
confirming the gate holds. Re-ran sync to confirm idempotency
(`watchedFromViewCount: 0` on the second pass, row counts unchanged).
Typecheck/lint/build clean.

### Albums don't get a watched status — it was never real data

A user looking at the Music browse grid noticed most albums showed
"unwatched" with only a scattered few marked "watched" for no
apparent reason, and questioned whether albums should have a watched
status at all.

Root cause: Plex scrobble events fire per-track, so `handleScrobble`
(`src/lib/server/plex/webhook-handler.ts`) always inserts
`watch_history` rows keyed to the *track's* media item id, never the
album's. The only path that could ever write a `watch_history` row
against an album's own id was the manual "mark as watched" action
(`POST /api/media/[id]/watch`, also wired into the browse-grid card's
action bar) — so a "watched" album on that grid never reflected actual
listening, only an accidental or exploratory click. Same issue on the
album detail page's "Watched" pill and "Last watched" line, which read
the same per-item `watch_history` rows.

Rather than back that badge with real data (aggregating watch status
up from an album's tracks was considered and rejected — a "50% of
tracks played" style status is a different, bigger feature, not what
was asked), removed the watched action/badge/filter for albums
entirely: `MediaCard` and `MediaBrowseGrid` gained a `showWatched`
prop (default `true`, set `false` on the Music page), and the album
detail page hides its "Watched" pill and "Last watched" line for
`item.type === 'album'`. Movies, shows, and tracks are unaffected —
tracks scrobble individually, so a track's own watched status is real.
Typecheck/lint/build clean.

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
