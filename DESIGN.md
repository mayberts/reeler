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
  SQLite DB. Deployed in practice via Unraid's Compose Manager plugin,
  building from the GitHub repo directly (`build.context` as a git URL) —
  no local clone needed on the Unraid box.
- No Community Apps template planned — Compose Manager already covers
  this deployment, a CA template would just be a second thing to keep in
  sync with no one asking for it.

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
style. Cards get a small checkmark badge when the signed-in user has a
`watch_history` row for that item — a cheap single follow-up query
against just the rendered page, not a join, since it only needs to cover
what's on screen. No pagination yet; the existing card-grid pages
(dashboard, history, etc.) don't paginate either, and the real library's
per-type counts are small enough that it isn't a problem yet.

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
3. ✅ Music tracking and manual/non-Plex logging. Music isn't pre-synced
   from the library like movies/shows — albums and tracks are created
   lazily from play history/webhooks, the same pattern episodes already
   used, since eagerly mirroring an entire music catalog isn't useful for
   "what did I listen to." Manual logging searches TMDb (movies/TV only —
   MusicBrainz/Last.fm for manually-logged music is still open, see
   below) and is optional: the app runs fine with no `TMDB_API_KEY` set,
   that section of the UI just says so instead of the search box.
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
