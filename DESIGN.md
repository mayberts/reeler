# Reeler — Design Scope

Status: **scoping only, nothing implemented yet.**

## Goals

- Sync library metadata from a self-hosted Plex Media Server (movies, TV,
  music).
- Track watch history per user, in near-real-time, sourced from Plex.
- Ratings, kept in sync both ways between Plex and the app.
- Personal and shared lists (watchlists, curated lists, etc.).
- Multi-user / household support, mapped to Plex Home users.
- Allow logging items *not* in the Plex library (theatrical releases, other
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
  SQLite DB.
- Longer-term: Unraid Community Apps template (XML) wrapping the image,
  with `PLEX_URL` / `PLEX_TOKEN` env vars and a WebUI port.

## Roadmap

1. Plex OAuth account linking, single-server library sync (movies + TV),
   watch-history backfill, webhook receiver.
2. Multi-user mapping to Plex Home accounts, two-way ratings sync, personal
   lists.
3. Music library tracking, manual/non-Plex logging via TMDb/MusicBrainz
   search.
4. Stats/dashboards, Unraid Community Apps packaging.

## Open questions

- Final project name (currently "Reeler", working title only).
- TMDb API key and MusicBrainz/Last.fm choice for music metadata need to be
  set up before Phase 3.
- Whether household member linking needs explicit admin approval, or
  auto-links any Plex Home user on first login.
