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
`watch_history` rows keyed to the _track's_ media item id, never the
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

### Stats page: rebuilt as a full dashboard, with music/listening time throughout

The original stats page (hero tiles, a single 12-month activity bar
chart, top-watched/top-rated lists) had no music in it at all, and a
user asked for a richer dashboard-style layout — modeled on a
reference app's stats page — that included it.

Rebuilt `/stats` end to end: 6 hero tiles (added tracks played,
listening time, split "watched" into movies/shows/episodes/tracks
instead of one combined count); a 12-month activity chart and a
watch/listen-time chart, both stacked by movie/episode/track; a
most-watched-genres breakdown split into Movies/Shows/Music columns;
time-spent and average-rating cards per type; a 1-10 rating
distribution histogram; an average-activity-by-weekday chart; and a
Collection section (per-type library size, plus watched/unwatched
donuts). Extracted three reusable chart primitives
(`StackedBarChart`, `SimpleBarChart`, `DonutChart` under
`lib/components/`) rather than one-off SVG per section, since the six
new chart-shaped sections all reduce to the same two or three shapes.

A few data-modeling problems came up along the way, each solved by
following a pattern already established elsewhere in the codebase
rather than inventing a new one:

- Episodes and tracks don't carry their own genre tags — only the
  show/album does — so "most-watched genres" and "shows watched"
  both walk the episode → season → show chain (and the equivalent
  one-hop track → album), the same hierarchy `upsertMediaItemFromPlex`
  already uses for parent linking. Weighted each parent's genre tags
  by the child's play count rather than counting the parent once, so
  a show binged 40 times contributes 40 tally marks, not 1.
- Reused the "genre" fix from movies collected earlier — Plex-mirrored genres
  live in a `genres` JSON column, not a joinable table — the JS-side
  parse-then-tally here mirrors `listAvailableGenres` in
  `lib/server/media/browse.ts` rather than reaching for SQLite's JSON1
  functions, which nothing else in the codebase relies on being
  compiled in.
- "Albums listened" (a real watched/unwatched donut for music) is
  derived from actual track plays joined up to their album — never
  from an album's own `watch_history` rows, which the previous fix
  above established don't reflect real listening. This is the
  legitimate version of the signal that fix removed: aggregated from
  real per-track plays instead of read off a fake per-album toggle.
- "Watch time"/"listening time" reuse the existing generic
  `runtimeMinutes` column (already populated for tracks from Plex's
  `duration` field, same as movies/episodes) rather than adding a
  music-specific duration field.

Verified with a seeded SQLite DB (40 movies, 5 shows/80 episodes, 30
albums with lazily-created tracks, mixed watch history and ratings
across all three) rendered via a real browser (Playwright against the
dev server) in both light and dark mode, including a hover
interaction check on the new stacked-bar tooltip. Typecheck/lint/build
clean.

### Settings page (stage 1 of 3): DB-backed config, Plex + TMDB, display prefs

A user asked for an in-app Settings page — modeled on a reference app's
screenshot (masked credential fields with a show/hide toggle and a
"test" button, a Save Changes button, a Display Settings section with
toggles and an accent-color picker) — to configure TMDB/TVDB/MusicBrainz
as metadata sources. Given up front that this was a 3-stage build (this
stage: settings infrastructure + Plex/TMDB + display prefs; stage 2:
TVDB fallback search; stage 3: MusicBrainz manual music logging), since
TVDB and MusicBrainz had no integration in the codebase at all yet and
building all three at once risked a single unreviewable, hard-to-verify
change.

Every config value Reeler has ever read from `.env`
(`PLEX_SERVER_URL`/`PLEX_TOKEN`/`PLEX_WEBHOOK_TOKEN`/
`PLEX_CLIENT_IDENTIFIER`/`TMDB_API_KEY`) moved onto a new singleton
`app_settings` DB row (`lib/server/settings.ts`), editable from
`/settings` (admin-only). Deliberately **not** a hard cutover: every
field is nullable, and `getAppSettings()` falls back to the matching
env var when a field is unset in the DB — so an existing `.env`-only
deployment keeps working unchanged after upgrading, with Settings as an
optional override layer rather than a migration every existing install
would be forced through. `getPlexConfig()` also stopped throwing when a
field is missing (it used to, via a `required()` helper) — each caller
now checks only the field(s) it actually needs and fails there instead.
That mattered concretely: Plex OAuth login only ever needed
`clientIdentifier`, never `serverUrl`/`token`, but the old throw-on-any-
missing-field shape meant login would have broken before an admin had
configured the Plex server connection at all, the exact
chicken-and-egg problem a login-gated Settings page would otherwise
create.

Also switched TMDb from a v3 `api_key` query param to a v4 Bearer Read
Access Token (`Authorization: Bearer <token>`) — what the reference
screenshot's "TMDB Read Access Token" field actually meant, and the
modern recommended TMDb auth method. TMDb's `/authentication` endpoint
made a natural validate-before-save check (accepts any credential, just
reports whether it authenticated), used both by the Settings page's
per-field "test" button and by the save action itself.

Accent color is a real app-wide theme, not per-page decoration: `+layout
.server.ts` reads it once (cheap, single indexed-PK row) and `+layout
.svelte` sets `--accent`/`--accent-ink` as inline custom properties on
the app's root wrapper, so every page inherits it through ordinary CSS
cascade with no per-page plumbing. `--rate-bg` (previously a second,
independently-hardcoded amber) was switched to `color-mix()` against
`--accent` so the rating pill's active state tracks the chosen color
too, instead of silently staying amber regardless of theme. Known,
deliberate gap: the Stats page's rating-distribution histogram still
uses a hardcoded amber — rewiring every chart color on that page to the
live accent was out of scope for a Settings-page change and would
dilute focus; left as a documented gap rather than a silent
inconsistency.

Verified end-to-end against a seeded SQLite DB with **no** `PLEX_*`/
`TMDB_API_KEY` env vars set at all except `PLEX_CLIENT_IDENTIFIER`
(confirming the no-chicken-and-egg claim structurally, not just by
reading the code): the app booted clean, background sync logged
"Plex server is not configured" and moved on rather than crashing,
`/login`'s pin-creation endpoint failed gracefully (502) rather than
throwing, and `/settings` correctly showed each field's env/db/unset
source. Via a real browser (Playwright): saved an unreachable Plex
server + fake token and confirmed the save was rejected _and nothing
was written to the DB_ (checked directly), tested a garbage TMDB token
and got a live, correct rejection from TMDb's own API, clicked through
all 7 accent colors and the 24-hour toggle and confirmed both persisted
across a reload, and confirmed a non-admin account gets a 403 from both
the page and the underlying test-credential API routes and never sees
the nav link. Typecheck/lint/build clean.

### Settings page (stage 2 of 3): TVDB as a fallback show search

TVDB previously had no real integration at all — a `tvdbId` column
that Plex's own guid parsing happened to populate, and a link-out on
the detail page, but nothing that ever queried TVDB's API. This stage
adds a real TVDB v4 client (`lib/server/tvdb/client.ts`: login/token
caching, `searchTvdb`, `getTvdbDetails`) and wires it into the History
page's manual-log search as exactly what the Settings page's own copy
already promised: a fallback "for shows not on TMDB."

Deliberately fallback-only, not merge-always: `searchForManualLog()`
(`routes/history/+page.server.ts`) tries TMDb first and only calls
TVDB when TMDb returns zero results, rather than always querying both
and combining — keeps the common case (TMDb has it) to one request,
and avoids TVDB results outranking a better TMDb match for anything
TMDb does have. `logManual` now branches on which source a result came
from (`source: 'tmdb' | 'tvdb'`), find-or-creating against `tmdbId` or
`tvdbId` respectively — `media_items` already had both columns from
the original Plex-guid-parsing design, so no schema change was needed
here. A TVDB-sourced item's tagline/backdrop stay null (TVDB doesn't
expose either in the shape TMDb does) rather than guessing at TVDB's
less predictable artwork-type taxonomy — same "leave it for a future
pass, don't guess" call as stage 1's backdrop gap.

The manual-log section's gate changed from "TMDb configured" to
"TMDb _or_ TVDB configured" (`manualLogEnabled`), since TVDB alone is
now a legitimate way to search — confirmed via the same fetch-mock
harness (below) that logging still works with only a TVDB key set and
no TMDb token at all.

This sandbox has no outbound network access to arbitrary third-party
hosts (confirmed: the outbound proxy 403s a direct `CONNECT` to
`api4.thetvdb.com`), so the real TVDB API couldn't be hit for
verification here the way earlier fixes hit a real/mock Plex server.
Verified instead by temporarily patching `globalThis.fetch` (prepended
into `hooks.server.ts` for the test run only, reverted via `git
checkout` before committing anything — never shipped) to serve
realistic TVDB v4 fixture JSON, then exercising the real, unmodified
route code through the actual running dev server and a real browser:
confirmed the TVDB fallback fires when TMDb returns empty and does
_not_ fire when TMDb has a result (checked both directions against the
same mock), confirmed the merged search result renders with a
"SHOW (TVDB)" badge, logged it and confirmed via direct DB query that
`tvdbId`/genres/summary/runtime landed correctly with `tmdbId` null,
and logged the same result a second time to confirm find-or-create
idempotency (one `media_items` row, two `watch_history` rows) — the
same guarantee the TMDb path already had. Typecheck/lint/build clean.

### Settings page: env-sourced fields looked saved when they weren't

A user removed their real Plex/TMDB values from `.env` after setting
up the Settings page, believing the page's mere existence meant those
values were already stored in the database — they weren't, since
nothing gets written to the DB until that card's "Save Changes" is
actually clicked. Every field was gone with no way back short of
re-entering the credentials from scratch.

Root cause was the hint copy, not the save logic itself (already
correct — see the stage 1 entry above: it only ever writes on an
explicit save). Each field's hint just named which env var it was
using ("Currently set via the PLEX_SERVER_URL environment variable"),
with no indication that meant "not saved here" — indistinguishable at
a glance from a hint on a field that _had_ been saved. The two states
(env-sourced-and-fragile vs. db-sourced-and-durable) look identical in
the input itself, since both just show a value.

Rewrote the hint to say so explicitly ("...not saved in the database
yet. Click Save Changes to store it here so it survives
PLEX_SERVER_URL being removed.") and gave it a distinct amber/warning
color (`SecretField`'s new `hintWarn` prop, plus the equivalent on the
two plain, non-secret fields) so it doesn't read the same as an
ordinary informational note at a skim. Considered auto-adopting
env-sourced values into the DB on page load instead, so this class of
mistake couldn't happen at all — rejected: a `load` (GET) silently
writing is a real footgun of its own, and some deployments
legitimately want to keep `.env` as the actual source of truth
(GitOps-style) without the Settings page quietly forking that state
into the DB just by being viewed.

Verified via a real browser: seeded a DB with real-looking env vars
and no DB-stored settings, confirmed every env-sourced field now shows
the amber warning with the corrected copy, and confirmed a genuinely
unset field still shows the original muted, non-alarming hint (the two
states are visually distinct, not just textually). Typecheck/lint/build clean.

### Settings page (stage 3 of 3): MusicBrainz manual music logging

The last open item from the original scoping doc's open questions:
MusicBrainz/Last.fm for manually-logged music was unresolved since
manual logging only ever covered movies/TV. This stage resolves it —
MusicBrainz, no Last.fm — and builds the manual music-logging flow
that never existed: a new `lib/server/musicbrainz/client.ts`
(`searchMusicBrainz`, `getMusicBrainzDetails`) and a parallel
"Log music not in Plex" section on the History page, alongside (not
replacing) the existing TMDb/TVDB-backed movie/TV one.

MusicBrainz needs no API key — its core API is free and keyless,
just rate-limited (1 req/sec unauthenticated) and identified by a
descriptive `User-Agent` header instead, which the client sets on
every request per MusicBrainz's own API etiquette. That makes the new
section unconditionally available, unlike the movie/TV one which
gates on a TMDb/TVDB key being configured.

Search results intentionally don't carry cover art — MusicBrainz
itself hosts no images; Cover Art Archive does, keyed by the same
release-group MBID, but fetching it for every row in a result list
would mean one extra request per result. Cover art is instead looked
up once, best-effort, at log time only (mirroring the existing
"fetch full details when actually logging, not when just searching"
pattern from the TMDb/TVDB paths) — and a release having no art on
file at all is common, not an error, so search results show a plain
letter-placeholder poster rather than a real cover, until logged.

Scoped to albums (`primarytype:album` in the MusicBrainz query, same
as how release-groups are the standard "album" concept there) —
matches Reeler's existing album-is-the-loggable-unit design (tracks
stay lazy, created from play history the same way episodes are).
MusicBrainz's own title field doesn't include the artist, and Reeler
has no artist concept for Plex-synced albums either (see the Data
model section above), so the artist is folded into the stored title
(`Album — Artist`) rather than adding a schema column for a single
manual-entry path to use.

Verified the same way as stage 2 (this sandbox has no outbound access
to `musicbrainz.org`/`coverartarchive.org` either): a temporary fetch
mock, reverted before committing, exercising the real route code
through the actual dev server and a real browser. Confirmed a search
result renders and logs correctly (right `musicbrainzId`, artist
folded into the title, cover art picked up from a mocked Cover Art
Archive response), confirmed the _other_ common case — no cover art
on file (mocked 404) — degrades to a null `artworkUrl` rather than
failing the log, and confirmed find-or-create idempotency on a second
log of the same album (one `media_items` row, two `watch_history`
rows). Typecheck/lint/build clean.

### First real logo/favicon

Reeler shipped every session before this one with SvelteKit's own
default favicon (`svelte-logo`) — never replaced. Picked a mark after
reviewing several concepts with the user (a rounded amber badge, a
play triangle resolving into three wave bars — movies and music in
one silhouette) and shipped it as both the static favicon
(`lib/assets/favicon.svg`, fixed brand color regardless of in-app
theme) and an inline nav mark next to the "Reeler" wordmark. The nav
version isn't a static copy: it reads `accent.hex`/`accent.ink` from
the same `ACCENT_COLORS` map the Settings page's accent picker already
uses, so the badge and its cutout recolor correctly for whichever of
the 7 accents a household has chosen, the same way every other
accent-colored element in the app already does — rather than being a
fixed amber mark that would clash the moment someone picks a different
accent. Verified in a real browser: the nav mark recolors correctly
after switching accent from amber to blue (contrast stays correct on
both, since `accent.ink` is exactly the token already computed for
this purpose), and holds up in dark mode.

### Shows browse grid: real watched-% for partially-watched shows

A user asked for a "watched %" on partially-watched shows in the
`/shows` grid. Investigating turned up the same root cause already
documented above for albums: a show's own `watched` boolean
(`browseMediaByType` in `lib/server/media/browse.ts`) was computed
from `watch_history` rows against the **show's own** `media_items.id`
— and per the album fix's reasoning, that's never real data for a
show either. Plex scrobbles fire per episode, never per show, so the
only way a show's own row could exist was a stray `viewCount` sync
quirk or the manual "mark as watched" click — neither means anything
close to "% of episodes watched."

Added `lib/server/media/show-progress.ts` (`getShowProgress`):
distinct watched episodes ÷ total episodes per show, resolved via the
same episode → season → show two-hop lookup already proven out in
`stats/+page.server.ts` (episodes are always pre-synced in full for a
library-synced show — see "Season pages" above — so the total is a
plain DB count, no extra Plex calls). `browseMediaByType` now uses this
for shows specifically: the returned `watched` boolean means "every
episode watched" (was "this exact row has a watch_history entry"), and
a new `watchProgress: number | null` carries the fractional value for
display. The existing Watched/Unwatched filter got the same treatment
— it used to inArray/notInArray against the show's own (bogus)
watch_history rows; now it's "all episodes watched" /
"zero episodes watched," computed against the real per-show ratio over
whatever the search/genre filters already narrowed down to, so
pagination and the total count stay correct.

Since a show's own watch_history row isn't meaningful, the click-to-
mark-watched button doesn't do anything real for a show either — it
would write a row nothing reads. `MediaCard` gained a `watchProgress`
prop: when set (only true for the shows grid), the watched action
becomes a read-only status — "Watched" / "NN%" / "Unwatched" — instead
of a button, and a thin progress-fill bar appears along the poster's
bottom edge for any show strictly between 0% and 100%. Movies and
albums are untouched — `watchProgress` stays `null` for them, so they
keep the existing boolean toggle (movies) or stay hidden entirely
(albums, `showWatched={false}` from the earlier fix).

Verified against a seeded DB with four shows (fully watched, half
watched, barely started, untouched): the grid showed "Watched" (green,
no bar), "50%" (bar at half width), "8%" (1 of 12 episodes, thin bar),
and "Unwatched" (no bar) respectively, matched in both light and dark
mode; the Watched filter returned only the fully-watched show and the
Unwatched filter returned only the untouched one, with the two partial
shows correctly excluded from both; and the old "Mark as watched"
button no longer renders on any show card. Typecheck/lint/build clean.

### Stats page: "watched" language and rankings leaking into music

Two small music-specific cleanups on `/stats`, same spirit as the
watched-status fixes above: the "Albums Listened" donut's legend still
said "Watched"/"Unwatched" (copy-pasted from the movies/shows donuts),
and "Most watched" was one type-agnostic ranking — a heavily-played
track could (and did, in practice) push movies and shows off a "most
watched" list despite never having been watched at all.

`watchedDonut()` became `progressDonut()`, taking the completed/
remaining labels as parameters instead of hardcoding "Watched"/
"Unwatched" — the albums donut now passes "Listened"/"Not listened".
The single top-list query split into `topWatched` (movie/show/episode)
and a new `topListened` (track/album), rendered as separate "Most
watched" and "Most listened" sections rather than one mixed ranking.
Verified against a seeded DB with both movie/show and track watch
history: "Most watched" now lists only the movie/episode rows,
"Most listened" only the tracks, and the albums donut reads
"Listened"/"Not listened". Typecheck/lint/build clean.

### Movies/Shows: redundant "Filter" button next to "Filters"

`MediaBrowseGrid`'s controls bar had two adjacent, similarly-labeled
controls: a "Filters" dropdown (genre checkboxes, watched radios) and a
separate accent-colored "Filter" submit button beside it — reported as
confusing, with the submit button looking broken. It wasn't broken (it
was the only way to apply genre/watched selections, since those inputs
had no auto-submit unlike the sort dropdown), but the redundancy was
real: two controls doing the job of one.

Fixed by giving the genre checkboxes and watched radios the same
`onchange` auto-submit the sort dropdown already had, then removing the
visible "Filter" button. A visually-hidden submit button stays in the
form so pressing Enter in the search box still works (a GET form with
multiple fields needs a submit button present for implicit submission).
Verified via Playwright against a seeded DB: only one visible control
("Filters") remains, Enter-to-search still submits
(`?q=Movie+3&sort=title&watched=`), checking a genre auto-submits and
correctly filters the grid, and selecting a watched radio auto-submits.
Typecheck clean.

### Music: album cards had no artist, no way to sort by one

Album cards on `/music` showed only title and year — no artist, and no
way to sort by one either, since `media_items` never had an artist
column at all. Root cause: Plex's music hierarchy is Artist -> Album ->
Track, and an album's own `parentTitle` (the artist) was simply
discarded on upsert — `PARENT_TYPE` only maps track/episode/season to
their parent, since artists were deliberately never modeled as their
own row (nothing to "track" about an artist itself, per the existing
comment in `media-item.ts`). That reasoning is still right, but it left
no way to _display_ the artist either, real data or not. The manually-
logged (MusicBrainz) path worked around the same gap by folding the
artist into the title string itself (`"Title — Artist"`), which is a
display hack, not real data modeling.

Added a nullable `artist` column to `media_items`. Plex sync now reads
it straight off `item.parentTitle` when upserting an album (both full
library syncs and lazy album creation from a first-played track go
through `enrichSparseItem`, which fetches full canonical metadata —
including the real parent/artist — before the row is built, so this
works for both paths without a backfill script; existing libraries
pick it up on the next sync, hourly or on restart). The manual
MusicBrainz-logging path now stores `artist` as its own column instead
of folding it into the title.

`MediaBrowseGrid` gained an optional `sortOptions` prop (defaulting to
the existing Title/Year/Recently-added set) so a specific browse page
can swap in its own; `/music` now shows "Album (A–Z)" / "Artist (A–Z)"
/ Year / Recently added. `browseSortValues` gained `'artist'`,
ordering by `artist` then `title` as a tiebreaker. Album cards now pass
`artist` through `MediaCard`'s existing `meta` slot ("2014 · Onyx"),
and the media detail page shows it as a badge too.

Verified against a seeded DB of 7 albums (including one with a null
artist, simulating an unsynced/legacy row): cards render "Year ·
Artist" correctly, the sort dropdown shows the new Album/Artist
labels, and switching to "Artist (A–Z)" sorted null-artist first then
alphabetically by artist (AC/DC, Buju Banton, Die Antwoord, Onyx x2,
The Beatles) — matching SQLite's default null-first ASC ordering.
Typecheck, lint, and production build all clean.

### Dashboard: rotating library backdrop

The dashboard was plain text on the page background — no reason not to
show off the library, the same way the media detail page's hero
already does for a single title. Added a hero banner above the
heading that picks one random item with a real backdrop (`plexArt` or
`backdropUrl` set) via `ORDER BY RANDOM() LIMIT 1`, reusing the
existing `/api/media/[id]/backdrop` proxy — no new image-serving code.
It's picked fresh in the page's `load` function, which SvelteKit
reruns on every navigation to `/`, so the backdrop changes each time
the page loads, same as requested.

Reused the same `light-dark()`-per-gradient-stop scrim technique the
detail page's hero already established (see "Poster art" above) rather
than inventing a new one — a lone heading needed a simpler single
vertical fade rather than that page's two-layer horizontal+vertical
one (no adjacent poster/text column to protect here). Falls back to
the plain heading with no hero at all when the library has no item
with a backdrop yet (a fresh, unsynced install).

Verified against a seeded DB of 3 movies with backdrops: 6 consecutive
loads of `/` picked varying backdrops (not the same one every time),
each `<img>` resolved through the real proxy route, and the heading
stayed legible against both a light and dark test image in both light
and dark color schemes. Typecheck clean.

### Dashboard hero: too short to see the backdrop

Reported directly after the rotating-backdrop hero shipped: it was too
short (fixed `padding-top`) to actually make out the image before the
scrim faded it out. Switched to a `min-height: clamp(16rem, 34vw,
28rem)` flex container (heading pinned to the bottom via
`align-items: flex-end` instead of top padding), and pushed the
scrim's low-opacity stop from 35% to 45% so more of the taller image
stays clear before the fade toward the heading starts. Verified
visually at 1200px in both light and dark color schemes — the hero is
now ~400px tall (was ~200px) with the backdrop clearly visible above
the heading. Typecheck, lint, and build clean.

### Moved library stats + sync button from Dashboard to Settings

The user-facing stats (Users/Media items/Watch history entries) and
"Sync now" button had been sitting on the Dashboard since before
Settings existed. Now that Settings exists and already owns every
other piece of sync-adjacent config (Plex connection, metadata
sources), triggering a sync from Dashboard was the odd one out —
moved both into a new "Library Sync" card on Settings, right after
Plex Connection.

The `sync` server action moved with it, now behind the same
`requireAdmin` guard as every other Settings action — previously any
signed-in user could trigger a sync from Dashboard; now it's
admin-only, consistent with the rest of Settings being admin-gated.
Dashboard's empty-history message ("Nothing watched yet…") now reads
differently depending on the viewer: admins get a link to Settings,
non-admins get "ask an admin to run a sync" instead, since a
non-admin hitting a 403 on `/settings` would be a dead end.

Verified against a seeded DB with one admin and one non-admin user:
Dashboard no longer renders `.stats` or a Sync button for either;
Settings' new Library Sync card shows the stats and a working Sync
button (clicking it round-trips through the real `sync` action and
surfaces the result/error inline, same as Dashboard's old behavior);
the non-admin sees neither a Settings nav link nor the admin wording,
and still gets a 403 hitting `/settings` directly (pre-existing
guard, unchanged). Typecheck, lint, and build all clean.

### Dashboard: "Next Up" hero + row

Requested after seeing Trakt's dashboard: a hero for the show you're
actively partway through, not just a random library backdrop, plus a
row of everything else in progress underneath.

New `getNextUp(userId, limit)` (`src/lib/server/media/next-up.ts`):
"in progress" means a show with `0 < watchedEpisodes < totalEpisodes`
(reusing `getShowProgress`, same definition as the shows-grid progress
bar), paired with the next unwatched episode in season/episode order
and the most recent `watchedAt` among the show's watched episodes (for
"watched most recently" ordering, matching Trakt's own Up Next). Same
two-hop episode -> season -> show resolution `getShowProgress` already
established; episodes carry their own `seasonNumber`/`episodeNumber`
directly, so ordering them doesn't need a season lookup.

The dashboard hero now shows the top Next Up pick (show title, episode
title, an "S01E04"-style badge, a "See all" link to `/shows`) when
there's anything in progress, falling back to the previous
random-backdrop behavior otherwise — so a fresh/unsynced install, or
one where everything's either untouched or fully watched, still gets a
hero rather than nothing. The hero backdrop prefers the episode's own
art and falls back to the show's; if neither has one, the hero
degrades to a plain heading exactly like the random-pick path already
did in that case. A new "Next Up" scroll-row (same `MediaCard`/
`.scroll-row` pattern as "Recently added") lists every in-progress
show below it, using each episode's own artwork (real Plex episodes
almost always have one distinct from the show poster) — clicking a
card or its watched button acts on that specific episode, same as any
other episode row.

Verified against a seeded DB with three shows — South Park (3/10
watched), Battlestar Galactica (1/5), Family Guy (8/8, fully watched)
— South Park and Battlestar Galactica both appeared in the Next Up
row with correct "next unwatched" episodes and S/E badges, Family Guy
correctly excluded (fully watched), and the hero showed South Park's
next episode (most recently watched of the two) with working
backdrop, badge, and "See all" link. Typecheck, lint, and build all
clean.

### Settings: full watch-history resync (disaster recovery)

Requested for recovering from lost/corrupted watch history in Reeler
(a bad migration, an accidental delete, etc.): a way to re-pull
everything from Plex, not just recent activity, on demand — explicitly
_not_ wired to any timer or startup hook, since that's a very different
risk profile from the existing automatic paths (the hourly library
sync and the 15-minute incremental history backstop).

Turned out `backfillWatchHistory`/`backfillAllUsers` already supported
this — passing no `since` means no time filter reaches Plex's
`/status/sessions/history/all` call, so it pages through the _entire_
history log. The existing "Sync now" button already calls
`backfillWatchHistory` unbounded, but only for whichever account
clicks it; this is a household-wide gap the button doesn't cover for
multi-user setups. Added a `fullHistorySync` action calling
`backfillAllUsers()` (no `since`) — every linked user, not just the
admin who clicks it — as a distinct, clearly-separated control in the
Library Sync card, with copy that says plainly what it does, that it's
safe to re-run (the existing (user, item, watchedAt) dedupe means it
only ever fills gaps), and that it can be slow on a large history.
Deliberately a plain (non-accent) button, not `.primary`, so it doesn't
compete visually with "Sync now" as the default action.

Verified against a seeded DB (admin with no linked `plexAccountId`):
the button round-trips through the real action and reports "0 users
scanned" rather than erroring, confirming `backfillAllUsers()` handles
the empty-linked-users case cleanly; the existing "Sync now" button and
its own result state are unaffected. Typecheck, lint, and build clean.

### Settings: push watch history back to Plex (the other disaster)

The previous entry above solved the wrong direction — "full history
resync" pulls Plex's history into Reeler, which helps if _Reeler_
loses its data but does nothing if _Plex_ is the one that loses its
history (a database reset, a re-added library). What was actually
wanted: push Reeler's watch history back out to Plex.

Plex's classic API has no bulk "write history" endpoint and no way to
set a historical timestamp on a watch — `/:/scrobble?key=...` (new
`scrobbleMedia` in `plex/client.ts`, same shape as the existing
`rateMedia`) only marks an item watched _now_. So this can restore
_that_ something was watched, never _when_ — documented plainly in
both the function's docstring and the Settings copy, since it's a real
gap between what "recover my history" sounds like and what's actually
possible. To avoid quietly overwriting a Plex item that already has an
accurate watched date, `pushHistoryToPlex` (`sync/history.ts`) checks
each candidate's current Plex `viewCount` via `getMetadata` first and
only scrobbles items Plex still shows as unwatched — it only ever
fills gaps, same dedupe philosophy as the pull direction.

Also owner-account-only, unlike the pull direction: scrobbling always
acts as whichever Plex account the single configured admin token
belongs to (Plex Home id `1`, see `PLEX_OWNER_ACCOUNT_ID`), and the
classic API has no way to scrobble on behalf of a different Home
member. Manually-logged items (no `plexRatingKey`) are excluded too —
they were never in Plex to begin with. New `pushHistory` action, added
as a second subsection alongside the renamed "Pull history from Plex"
one (was "Full history resync" — renamed so the two are unambiguous
about direction now that both exist side by side).

Verified against a seeded DB with a mocked Plex (`getMetadata`/
`scrobbleMedia` intercepted via the usual `hooks.server.ts` fetch-patch
technique, reverted before commit) and three watched movies for the
owner: one Plex reports unwatched (correctly scrobbled), one Plex
already reports watched (correctly skipped, confirming the
no-overwrite guard), one manually-logged with no `plexRatingKey`
(correctly excluded from the scan entirely). Result message matched:
"Scanned 2 watched items, marked 1 as watched in Plex (1 already
watched there or skipped)." Typecheck, lint, and build clean.

### Favicon now recolors with the accent color

The static `favicon.svg` asset hardcoded amber, so changing the accent
in Settings recolored the nav brand mark (already accent-aware, inline
SVG in `+layout.svelte`) but left the browser tab icon stuck on amber
— a `<link rel="icon">` loads its target as an opaque image resource,
with no access to the page's CSS variables, so a static asset can
never reflect a runtime setting.

Replaced it with a server route, `src/routes/favicon.svg/+server.ts`,
that renders the identical "Play & Wave" mark with the current
`accentColor`'s hex/ink from `ACCENT_COLORS` baked directly into the
SVG. The `<link>` tag's href is now `/favicon.svg?accent={accentColor}`
— keying the URL on the color, not just requesting the same URL every
time, matters because browsers cache favicons aggressively; changing
Settings already calls `invalidateAll()`, which updates `accentColor`
and therefore the href, and the changed query string forces an actual
refetch instead of the browser reusing whatever it cached for the old
color. Added `/favicon.svg` to `hooks.server.ts`'s public-path list —
the browser requests it regardless of auth state (e.g. for the login
page itself), and it carries no user-specific data, only the global
accent color. Removed the now-fully-superseded static asset.

Verified against a seeded DB: `/favicon.svg` served purple
(`#7c3aed`) matching the seeded `accentColor`, worked without
authentication, and clicking the Green swatch in Settings updated the
`<link>` href from `.../favicon.svg?accent=purple` to
`/favicon.svg?accent=green` with the route then serving green's hex
for that query — confirming the full reactive chain end to end.
Typecheck, lint, and build clean.

### Cast, crew, and person pages

Requested against reference screenshots of TMDb's own cast grid and
person page. Real bios, personal info, and "Known For" filmography
only exist in TMDb's data — Plex's own metadata has none of that — so
this is TMDb-only by design: a title with no `tmdbId` (a TVDB-only
show, an unmatched item) just shows no cast section, same spirit as
the existing TVDB fallback being TMDb's own gap-filler rather than a
universal requirement.

New `people`/`credits` tables (`schema.ts`). `people` rows are keyed
on TMDb person id and shared across every credit that person has in
the library — created "thin" (id/name/photo only) the first time they
turn up in some title's cast/crew, then "filled in" (biography,
birthday, place of birth, ...) lazily, the first time someone actually
opens their own `/people/[id]` page. A `detailsFetchedAt` sentinel
distinguishes "never looked up" from "looked up, TMDb had nothing" —
without it, a person with no bio on file would re-trigger a TMDb call
on every single page view.

Cast/crew itself is fetched and cached the first time a movie/show's
own detail page is opened (`getOrFetchCredits`, `media/credits.ts`) —
deliberately not during library sync or on any schedule, so a full
sync stays fast regardless of library size; every title's cast/crew
costs nothing until someone actually looks. New TMDb client methods:
`getTmdbCredits` (cast capped at 20 by TMDb's own billing order; crew
filtered to a fixed allowlist of key jobs — director, writer,
producer, ... — since a modern production's full crew list commonly
runs into the hundreds of names across every department Reeler has no
reason to show), `getTmdbPerson` (bio/personal info), and
`getTmdbPersonKnownFor` (a person's most notable other credits).

"Known For" is deliberately _not_ persisted like credits are — it's
pulled live from TMDb on every person-page view instead. Two reasons:
it's a pure browsing aid that drifts as a career progresses (unlike a
movie's own cast, which doesn't change), and the titles in it usually
aren't in Reeler's library at all — persisting them as tracked rows
would mean modeling "just browsing" data Reeler has no other reason to
know about. A "Known For" title that _does_ happen to already be in
the library (same `tmdbId`) links to its own local `/media/[id]` page;
otherwise it links out to TMDb's own page for it, same pattern as the
existing external-ID links on the detail page.

Verified against a seeded DB with a mocked TMDb (temporary fetch-patch,
reverted before commit): a movie's page showed the mocked cast (with
characters) and crew (correctly filtered — a "Gaffer" crew entry was
excluded, only "Director" survived the job allowlist); clicking a cast
member correctly navigated to their `/people/[id]` page showing name,
biography, and personal info fetched and cached on that first visit;
the Known For grid showed one title linking internally (its `tmdbId`
matched a title already in the seeded library) and one linking out to
TMDb (no local match); reloading the movie page served the same cast
from the cache with no further TMDb call. Typecheck, lint, and build
all clean.

### Fixed: movie/show pages 500ing after the cast/crew PR

Reported right after the cast/crew feature shipped: "nothing is
showing for movies or shows." Root cause: `getOrFetchCredits`'s very
first query reads the new `credits` table, with no guard around it —
on a deployment that hasn't re-applied the schema since those tables
were added (a container that hasn't restarted/redeployed yet, since
that's what runs `drizzle-kit push`; or a local `npm run dev` against
an existing DB file, which never runs it at all), that query throws
`SqliteError: no such table: credits`, uncaught, which propagates out
of the detail page's `load()` entirely — a 500 for every movie/show
page, while episode/track/album pages kept working fine (they return
early before ever touching the new tables), matching the report
exactly.

Wrapped the whole body of `getOrFetchCredits` in a try/catch — cast/
crew is a supplementary section, and losing it (missing tables, a
TMDb error, anything) must never take the rest of the detail page down
with it. Reproduced the exact failure first (seeded a DB with the
pre-this-PR schema — no `people`/`credits` tables — and confirmed a
`500`/`SqliteError: no such table: credits` on `/media/[id]`), then
verified the fix turns that into a normal `200` with the cast section
simply absent and the error logged server-side instead. Re-ran the
existing mocked-TMDb happy-path check too, to confirm the fix didn't
regress the working case — cast/crew still renders correctly. The
underlying "why doesn't this deployment have the new tables yet"
question is a redeploy/restart the user needs to do on their end
(or `npm run db:push` for a bare `npm run dev` setup) — this fix
just stops a stale schema from being able to break the page while
that happens. Typecheck, lint, and build clean.

### Fixed the real cause: movies/shows never got external ids at all

The previous fix stopped the page from 500ing, but the user reported
cast/crew was still completely absent everywhere — no cast section on
any title, and (looking at a screenshot) no TMDb/IMDb/TVDB badge
either, on a title with plenty of other Plex metadata. That second
detail was the real clue: external ids were never getting synced for
movies/shows at all, cast/crew or not — a pre-existing gap the
cast/crew feature was just the first thing to make visible, since a
missing external-link badge is easy to not notice but a whole missing
section isn't.

Root cause: Plex's bulk `/library/sections/{id}/all` listing (what
`syncLibrary` uses for every movie/show/season) omits the `Guid` array
— the one `tmdbId`/`imdbId`/`tvdbId` extraction
(`extractExternalIds` in `media-item.ts`) actually reads — unless the
request explicitly passes `includeGuids=1`. Without it, Plex only
returns the single legacy `guid` field, which isn't in the parseable
`tmdb://...` form. `syncLibrary` never passed that parameter, so every
movie/show/season synced through the normal bulk path got no external
ids, full stop — not a regression from the cast/crew PR, just never
working. (Track/album/episode items created lazily from watch history
or a webhook were unaffected: `enrichSparseItem` fetches those
individually via `/library/metadata/{ratingKey}`, which includes
`Guid` by default with no extra parameter.)

Fixed by adding `includeGuids=1` to every `listSectionItems` call in
`syncLibrary`. No backfill script needed — `upsertMediaItemFromPlex`
already upserts by `plexRatingKey` and only overwrites `tmdbId` when a
new value is actually found (`tmdbId ?? existing?.tmdbId ?? null`), so
simply re-running the existing "Sync now" button re-populates every
already-synced title's external ids, same "resync fills it in" pattern
already used for the artist field.

Verified against a seeded DB with a movie that had a `plexRatingKey`
but no `tmdbId` (simulating a title synced before this fix) and a
mocked Plex that — matching Plex's real behavior exactly — only
includes the `Guid` array in its response when `includeGuids=1` is
actually present in the request: before triggering a sync, confirmed
`tmdb_id`/`imdb_id` were `null` in the DB; clicked the real "Sync now"
button in Settings; confirmed both were now correctly populated
(`999`/`tt999` from the mock) afterward. Typecheck, lint, and build
clean.

### Person page: link to the full TMDb filmography

"Known For" deliberately caps at a person's 8 most popular credits
(see the cast/crew entry above) rather than their whole filmography —
by design, not a bug, but there was no way to see everything beyond
those 8. Added a "See full filmography on TMDb" link next to the
"Known For" heading, pointing at `themoviedb.org/person/{tmdbId}` —
TMDb's own person page already lists both movies and TV credits
together in one place, so a single link covers both. Shown regardless
of whether any "Known For" items loaded (a person row's `tmdbId` is
always present, unlike the live-fetched known-for list, which can
come back empty), with an explicit empty-state message in that case
rather than a bare gap.

Verified against a seeded person: the link's href resolved to the
correct `themoviedb.org/person/{tmdbId}` URL and opens in a new tab.
Typecheck, lint, and build clean.

### Person page: "In Your Library" section

"Known For" is TMDb's own live list — useful, but it's a browsing aid
for titles that may not even be in the library, not "what do I
actually own featuring this person." Added a distinct "In Your
Library" section above it: every title in _this_ Reeler library the
person has a `credits` row against, a pure local query (no TMDb call)
against data the app already has. Placed first since it's the more
actionable of the two — your own collection before a live external
list.

A person with both a cast and a crew credit on the same title (an
actor-director, say) merges into one card listing both roles
("Happy Hogan · Director") rather than two separate entries for the
same title. Only reflects titles whose own cast/crew has actually
been fetched already — `getOrFetchCredits` is lazy per-title, not a
sync-time crawl of every person's full history — so this section fills
in gradually as more of the library's detail pages get visited, the
same tradeoff the credits feature itself already accepted.

Incidental hardening while in this file: wrapped the `getTmdbPersonKnownFor`
call in a try/catch too (it wasn't before) — same "supplementary data
must never break the page" principle the credits-table crash fix
already established, applied to the one remaining unguarded TMDb call
on this page.

Verified against a seeded person credited on two local titles — one
with both a cast and a crew credit (merged into a single card showing
"Happy Hogan · Director"), one crew-only ("Writer") — both rendered
correctly, the cast+crew title linked to its real local `/media/[id]`
page, and the section worked correctly with zero TMDb network access
(proving it's fully independent of TMDb availability, as intended).
Typecheck, lint, and build clean.

### "In Your Library" was missing titles never individually visited

Reported directly: a user knew they had more Harrison Ford titles in
their library than the section showed. Working as designed at the
time, but the design itself was the problem — "In Your Library" only
read the local `credits` table, which only has a row for a (person,
title) pair once _that specific title's own detail page_ has been
opened at least once (`getOrFetchCredits` is lazy, per-title). A
library with dozens of Harrison Ford titles would only show the
handful whose pages happened to have been clicked into already, with
no indication anything was missing — exactly what got reported.

Fixed by adding a second source: TMDb's full (uncapped) combined-
credits list for the person, cross-referenced against the local
library by `tmdbId` — the same person page already fetches this same
endpoint for "Known For" (previously capped to the top 8 by
popularity for that strip); `getTmdbPersonAllCredits` reuses the same
underlying fetch/parse (refactored into a shared
`getPersonCombinedCredits`) without the cap. This catches every title
the person's actually credited on that's in the library right now,
without waiting for each one's own page to be visited first.

The local `credits` table still wins when both sources cover the same
title — it can show _multiple_ merged roles (an actor-director's
"Happy Hogan · Director"), where TMDb's combined-credits list only
ever picks one credit per title (its own dedup, by popularity). So
the fix is additive: local data fills in normally, and the TMDb cross-
reference now closes the gap only for titles the local table hasn't
caught up to yet — never overrides a title source 1 already covers.

Verified against a seeded Harrison Ford with two local titles: one
with a pre-existing local `credits` row ("Indiana Jones"), one with no
local credits row at all but a matching `tmdbId` in the library (the
exact case that was silently dropped before). Both now appear; the
first shows its local role, unchanged; the second — previously
invisible — now shows "Han Solo" from the TMDb cross-reference,
correctly linking to its real local `/media/[id]` page. Typecheck,
lint, and build clean.

### Crew now gets photo cards, matching Cast

Crew previously rendered as a plain text list (name + job) while Cast
got full photo cards — an inconsistency, not a deliberate choice.
Switched Crew to reuse the exact same `.cast-grid`/`.person-card`
markup and styling Cast already uses, just fed `job` instead of
`character` as the caption. Removed the now-unused `.crew-grid`/
`.crew-item` styles rather than leaving dead CSS behind.

Verified against a seeded movie with a mocked Director and Writer
credit: both now render as photo cards (profile photo or initial
placeholder, name, job) inside the same grid layout Cast uses, visibly
consistent with it. Typecheck, lint, and build clean.

### "View full cast on TMDb" hint when cast is truncated

`getTmdbCredits` caps cast at 20 (TMDb's own billing order) with no
indication to the viewer that a title's real cast might be longer —
someone looking at a 20-person cast list had no way to tell whether
that was everyone or just where the cap kicked in. Added a "View full
cast on TMDb" link next to the "Top Cast" heading, shown whenever the
stored cast count is at or above the cap (`CAST_LIMIT = 20`, matching
`getTmdbCredits`'s slice — duplicated as a client-side constant with a
comment noting the coupling, rather than trying to import the
server-only value into a `.svelte` file). Reuses the same
`.section-header-row`/`.tmdb-link` pattern already established on the
person page's "See full filmography" link, for visual consistency.

Didn't try to show an exact "+N more" count — that would need
persisting the title's true total cast size somewhere (a new
`media_items` column, or similar), since the local `credits` table
only ever stores the already-capped 20 rows. A link to TMDb's own full
cast page needs no extra schema and matches the filmography link's
existing "here's more, go look" pattern instead of a precise number.

Verified against two seeded movies with a mocked TMDb: one with 25
cast members (over the cap) correctly showed exactly 20 cards plus the
"View full cast" link, linking to `themoviedb.org/movie/{id}/cast`;
one with 3 cast members (under the cap) showed all 3 cards and
correctly did _not_ show the link. Typecheck, lint, and build clean.

### Settings page: tabs instead of one long scroll

The Settings page had grown to four stacked cards (Plex Connection,
Library Sync, Metadata Sources, Display) in a single vertical list,
making it a long scroll to reach anything past the first section.
Split it into a left sidebar nav with four tabs, each showing only its
own section — all the existing per-section markup, form actions, and
result-message logic moved unchanged into `{#if activeTab === '...'}`
blocks, no behavioral changes within a section.

The active tab is kept in the URL (`?tab=sync`, etc.) via
`replaceState`, not local-only `$state`, so a link elsewhere in the
app can point straight at e.g. Settings → Metadata, and the tab
survives a page refresh instead of always bouncing back to the first
one. Read on init from `page.url.searchParams`, defaulting to `plex`
for an unset or unrecognized value.

`svelte/no-navigation-without-resolve` requires the first argument to
`replaceState` to be a direct `resolve()` call (it doesn't unwrap
template literals or string concatenation looking for one). SvelteKit's
`resolve()` accepts a pathname with its query string already attached,
so `replaceState(resolve(\`/settings?tab=${tab}\`), {})` satisfies the
rule directly instead of building the URL separately and interpolating
a resolved path into it.

On mobile the sidebar nav switches to a wrapping horizontal row above
the content instead of a fixed-width column, so it doesn't eat
horizontal space on a narrow screen.

Verified with a seeded admin session: each tab shows only its own
section, clicking a tab updates the URL without a full page
reload, and reloading on a non-default tab (`?tab=display`) stays on
that tab instead of resetting to Plex Connection. Checked the mobile
layout at 375px width. Typecheck, lint, and build clean.

### Music search now matches artist, not just album title

The Music page's search box only filtered on `mediaItems.title`, so
searching an artist's name (e.g. "eminem") found nothing unless it
happened to also appear in an album title — surprising on a page
that's otherwise organized around artists (sortable by Artist,
grouped visually by cover art). Changed `browseMediaByType`'s search
condition to `OR` a `LIKE` match against `mediaItems.artist` alongside
the existing title match. `artist` is only ever set on albums (null
for movies/shows), so this is a no-op for the Movies/Shows pages that
share the same function.

Also added a `searchPlaceholder` prop to `MediaBrowseGrid` (default
"Filter by title", unchanged for Movies/Shows) so the Music page can
say "Filter by album or artist" instead, since the box now does more
than the generic placeholder implied.

Verified against four seeded albums (two by the same artist, two by
different artists): searching the shared artist's name returned both
of their albums; searching an album title returned just that album;
a non-matching query returned zero results.

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
   Manual logging searches TMDb/TVDB (movies/TV) and is optional there:
   the app runs fine with no key set, that section of the UI just says
   so instead of the search box. Manual music logging (MusicBrainz) is
   unconditional — no key needed — see roadmap phase 5, stage 3.
4. ✅ Stats page: hero tiles, activity/watch-time charts, genre
   breakdowns, rating distribution, day-of-week activity, and a
   Collection section with watched/unwatched donuts — covering movies,
   shows, and music (listening time, tracks played, albums listened)
   throughout. Rebuilt into this fuller dashboard shape after initially
   shipping a simpler version (hero tiles, one activity chart,
   top-watched/top-rated lists) with no music in it at all — see the
   fix log above. (Unraid Community Apps packaging dropped — not
   needed, see Deployment above.)

All four original roadmap phases are done.

5. ✅ In-app Settings page (admin-only), replacing `.env`-only config.
   DB-backed settings with env-var fallback; Plex connection and TMDB
   (v4 Bearer token) editable and validated from the UI; accent-color
   theming and a 24-hour time toggle; a real TVDB client used as a
   fallback when manually searching for a show TMDb doesn't have; a
   MusicBrainz client and manual-music-logging flow, parallel to the
   existing TMDb/TVDB-backed movie/TV one. Shipped in three stages —
   see the fix log above for all three.

All five roadmap phases are done. Nothing currently queued — next work
should come from actual usage, not a pre-written plan.

## Open questions

- Final project name (currently "Reeler", working title only).
- ~~MusicBrainz/Last.fm choice for manually-logging music~~ — resolved:
  MusicBrainz, no API key needed (unlike TMDb/TVDB). Built — see
  roadmap phase 5.
- ~~Whether household member linking needs explicit admin approval~~ —
  resolved for now: any Plex account that completes the OAuth sign-in
  auto-links to a new Reeler account, first one in becomes admin. No
  approval gate yet; revisit if that's too open for a shared server.
