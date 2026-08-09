# Reeler

Self-hosted media tracking app that syncs your Plex library and tracks watch
history, ratings, and personal lists — across movies, TV, and music, for
everyone in your household.

Working name — not finalized yet. See [`DESIGN.md`](./DESIGN.md) for the full
scope, architecture, and roadmap. Currently at the **scaffold** stage: the
app boots, the schema is defined, and the Plex webhook endpoint is wired up,
but the actual sync engine and UI are not yet implemented.

## Stack

SvelteKit (TypeScript) + Drizzle ORM on SQLite, deployed as a single Docker
container. See `DESIGN.md` for the reasoning.

## Developing

```sh
npm install
cp .env.example .env   # fill in PLEX_SERVER_URL, PLEX_TOKEN, PLEX_WEBHOOK_TOKEN
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
cp .env.example .env   # fill in PLEX_SERVER_URL, PLEX_TOKEN, PLEX_WEBHOOK_TOKEN
docker compose up -d --build
```

The SQLite DB lives in `./config` (bind-mounted to `/config` in the
container) — on Unraid, point this at an appdata path instead, e.g.
`/mnt/user/appdata/reeler:/config`. The container applies the Drizzle schema
on every start, so no manual migration step is needed.

Configure a webhook in Plex (Settings → Webhooks) pointing at:

```
http://<this-app-host>:3000/api/webhooks/plex/<PLEX_WEBHOOK_TOKEN>
```
