import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { appSettings, accentColorValues, type AccentColor } from '$lib/server/db/schema';

const SETTINGS_ID = 'singleton';

export interface AppSettings {
	plexServerUrl: string | null;
	plexToken: string | null;
	plexWebhookToken: string | null;
	plexClientIdentifier: string | null;
	tmdbReadAccessToken: string | null;
	tvdbApiKey: string | null;
	accentColor: AccentColor;
	twentyFourHourTime: boolean;
}

/** Which fields actually came from the database vs. falling back to an env var — the
 *  Settings page needs this to know whether a field is admin-editable-and-set, or
 *  currently inherited from `.env` (shown as a placeholder, not a value to overwrite). */
export interface AppSettingsSource {
	plexServerUrl: 'db' | 'env' | 'unset';
	plexToken: 'db' | 'env' | 'unset';
	plexWebhookToken: 'db' | 'env' | 'unset';
	plexClientIdentifier: 'db' | 'env' | 'unset';
	tmdbReadAccessToken: 'db' | 'env' | 'unset';
	tvdbApiKey: 'db' | 'env' | 'unset';
}

function pick(dbValue: string | null | undefined, envValue: string | undefined) {
	const value = dbValue || envValue || null;
	const source: 'db' | 'env' | 'unset' = dbValue ? 'db' : envValue ? 'env' : 'unset';
	return { value, source };
}

async function getRow() {
	return (await db.query.appSettings.findFirst({ where: eq(appSettings.id, SETTINGS_ID) })) ?? null;
}

/** Resolves effective app config: a value set via the Settings page always wins, else
 *  falls back to the equivalent env var, else null (feature/connection disabled). */
export async function getAppSettings(): Promise<AppSettings> {
	const row = await getRow();

	const serverUrl = pick(row?.plexServerUrl, env.PLEX_SERVER_URL);

	return {
		plexServerUrl: serverUrl.value ? serverUrl.value.replace(/\/+$/, '') : null,
		plexToken: pick(row?.plexToken, env.PLEX_TOKEN).value,
		plexWebhookToken: pick(row?.plexWebhookToken, env.PLEX_WEBHOOK_TOKEN).value,
		plexClientIdentifier: pick(row?.plexClientIdentifier, env.PLEX_CLIENT_IDENTIFIER).value,
		tmdbReadAccessToken: pick(row?.tmdbReadAccessToken, env.TMDB_API_KEY).value,
		tvdbApiKey: pick(row?.tvdbApiKey, env.TVDB_API_KEY).value,
		accentColor: (row?.accentColor as AccentColor | undefined) ?? 'amber',
		twentyFourHourTime: row?.twentyFourHourTime ?? false
	};
}

/** Same resolution as `getAppSettings`, but reports where each credential came from
 *  instead of the raw value — for rendering the Settings form without ever sending an
 *  env-var-sourced secret to the client as if it were a saved, editable value. */
export async function getAppSettingsSource(): Promise<AppSettingsSource> {
	const row = await getRow();
	return {
		plexServerUrl: pick(row?.plexServerUrl, env.PLEX_SERVER_URL).source,
		plexToken: pick(row?.plexToken, env.PLEX_TOKEN).source,
		plexWebhookToken: pick(row?.plexWebhookToken, env.PLEX_WEBHOOK_TOKEN).source,
		plexClientIdentifier: pick(row?.plexClientIdentifier, env.PLEX_CLIENT_IDENTIFIER).source,
		tmdbReadAccessToken: pick(row?.tmdbReadAccessToken, env.TMDB_API_KEY).source,
		tvdbApiKey: pick(row?.tvdbApiKey, env.TVDB_API_KEY).source
	};
}

export interface AppSettingsPatch {
	plexServerUrl?: string | null;
	plexToken?: string | null;
	plexWebhookToken?: string | null;
	plexClientIdentifier?: string | null;
	tmdbReadAccessToken?: string | null;
	tvdbApiKey?: string | null;
	accentColor?: AccentColor;
	twentyFourHourTime?: boolean;
}

export function isAccentColor(value: string): value is AccentColor {
	return (accentColorValues as readonly string[]).includes(value);
}

/** Upserts the singleton settings row — only the given fields change, everything else
 *  (including fields never set, still falling back to env vars) is left alone. */
export async function updateAppSettings(patch: AppSettingsPatch): Promise<void> {
	await db
		.insert(appSettings)
		.values({ id: SETTINGS_ID, ...patch })
		.onConflictDoUpdate({
			target: appSettings.id,
			set: { ...patch, updatedAt: new Date() }
		});
}
