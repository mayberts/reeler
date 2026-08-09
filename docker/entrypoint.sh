#!/bin/sh
set -e

# Applies the schema to whatever DATABASE_URL points at (the mounted /config
# volume in the default compose setup). Safe to run on every start: a no-op
# once the schema is already up to date.
npx drizzle-kit push

exec node build
