# better-sqlite3 needs a native build toolchain, in both stages: the build stage to
# compile it, and the runtime stage because we keep drizzle-kit (a devDependency) around
# to run schema push on container start.
FROM node:22-alpine AS build
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# SvelteKit's build analyses server modules, which import the DB client — it opens a
# sqlite file eagerly at import time and throws if DATABASE_URL is unset. This is a
# build-time-only placeholder; the real path is set via the runtime environment and
# entrypoint.sh applies the schema to that path, not this one.
ENV DATABASE_URL=/tmp/build.db
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/src/lib/server/db/schema.ts ./src/lib/server/db/schema.ts
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 3000
ENV PORT=3000
# --start-period covers entrypoint.sh's drizzle-kit push (runs before `node build`
# starts listening) so a normal startup isn't counted as a failed check. /api/health is
# unauthenticated (see PUBLIC_PATH_PREFIXES) and does a trivial DB query, so this
# reports a wedged/corrupted database as unhealthy too, not just "process is running."
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
	CMD wget --no-verbose --tries=1 --spider "http://localhost:$PORT/api/health" || exit 1
ENTRYPOINT ["./entrypoint.sh"]
