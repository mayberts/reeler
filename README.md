# Reeler

Self-hosted media tracking app that syncs your Plex library and tracks watch
history, ratings, and personal lists — across movies, TV, and music, for
everyone in your household.

Working name — not finalized yet. See [`DESIGN.md`](./DESIGN.md) for the full
scope, architecture, and roadmap.

## Stack

SvelteKit (TypeScript) + Drizzle ORM on SQLite, deployed as a single Docker
container. See `DESIGN.md` for the reasoning.

## Developing

```sh
npm install
cp .env.example .env   # fill in PLEX_CLIENT_IDENTIFIER at minimum — see below
npm run db:push         # creates/updates the local SQLite schema
npm run dev
```

Other useful scripts:

```sh
npm run check   # type-check
npm run lint    # prettier --check + eslint
npm run format  # prettier --write
npm run build   # production build (adapter-node)
npm run db:studio  # browse the local SQLite DB
```

## Deploying (Docker)

```sh
cp .env.example .env   # fill in PLEX_CLIENT_IDENTIFIER at minimum — see below
docker compose up -d --build
```

The SQLite DB lives in `./config` (bind-mounted to `/config` in the
container) — on Unraid, point this at an appdata path instead, e.g.
`/mnt/user/appdata/reeler:/config`. The container applies the Drizzle schema
on every start, so no manual migration step is needed.

## Configuration

Everything in `.env.example` — Plex connection, TMDB, TVDB — can be set two
ways: the `.env` file (read at startup), or the in-app **Settings** page
(admin only, in the nav once logged in), which takes priority over `.env`
when both are set. `.env` is enough to get running non-interactively (e.g. a
first Docker deploy); Settings is the more convenient place to manage or
rotate things afterward, with each credential validated against the real
service before it's saved.

The one thing `.env` has to provide up front is `PLEX_CLIENT_IDENTIFIER` —
it's the only value Plex OAuth sign-in itself needs, so it has to exist
before you can log in and reach Settings at all. Everything else (Plex
server URL/token, TMDB, TVDB) can be left blank in `.env` and filled in from
Settings after your first sign-in. Music metadata (MusicBrainz) needs no key
at all.

Once `PLEX_WEBHOOK_TOKEN` is set (either way), configure a webhook in Plex
(Settings → Webhooks) pointing at:

```
http://<this-app-host>:3000/api/webhooks/plex/<PLEX_WEBHOOK_TOKEN>
```
