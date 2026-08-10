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
