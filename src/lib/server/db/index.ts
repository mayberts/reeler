import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const client = new Database(env.DATABASE_URL);
// WAL lets reads and writes proceed concurrently instead of blocking each other, and
// (paired with `synchronous = NORMAL`, safe under WAL — only an OS-level crash, not an
// app crash, could lose the last commit) checkpoints instead of fsyncing every commit.
// Without this, every write — including each row of a library sync — pays a full disk
// sync on its own.
client.pragma('journal_mode = WAL');
client.pragma('synchronous = NORMAL');

export const db = drizzle(client, { schema });
/** The raw better-sqlite3 connection — for batching many writes into one transaction
 *  via manual BEGIN/COMMIT (see `syncLibrary`), which `db.transaction()` can't do since
 *  it requires a fully synchronous callback and library syncs are async. */
export const sqliteClient = client;
