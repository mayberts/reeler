#!/bin/sh
set -e

# Applies the schema to whatever DATABASE_URL points at (the mounted /config
# volume in the default compose setup). Safe to run on every start: a no-op
# once the schema is already up to date. --force skips the interactive
# confirmation prompt, which has no TTY to answer it in a container and was
# silently no-op'ing instead of applying the schema.
npx drizzle-kit push --force

exec node build
