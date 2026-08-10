import { error, fail } from '@sveltejs/kit';
import {
	getAppSettings,
	getAppSettingsSource,
	updateAppSettings,
	isAccentColor
} from '$lib/server/settings';
import { verifyPlexConnection } from '$lib/server/plex/client';
import { verifyTmdbToken } from '$lib/server/tmdb/client';
import { verifyTvdbKey } from '$lib/server/tvdb/client';
import type { Actions, PageServerLoad } from './$types';
import type { RequestEvent } from '@sveltejs/kit';

function requireAdmin({ locals }: RequestEvent) {
	if (!locals.user) error(401, 'Not authenticated');
	if (!locals.user.isAdmin) error(403, 'Admin access required');
	return locals.user;
}

function str(form: FormData, key: string): string {
	const value = form.get(key);
	return typeof value === 'string' ? value.trim() : '';
}

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const [settings, source] = await Promise.all([getAppSettings(), getAppSettingsSource()]);
	return { settings, source };
};

export const actions: Actions = {
	savePlex: async (event) => {
		requireAdmin(event);
		const form = await event.request.formData();

		const plexServerUrl = str(form, 'plexServerUrl');
		const plexToken = str(form, 'plexToken');
		const plexWebhookToken = str(form, 'plexWebhookToken');
		const plexClientIdentifier = str(form, 'plexClientIdentifier');

		if (plexServerUrl || plexToken) {
			if (!plexServerUrl || !plexToken) {
				return fail(400, {
					card: 'plex' as const,
					message: 'Server URL and token are both needed together.'
				});
			}
			const ok = await verifyPlexConnection(plexServerUrl, plexToken);
			if (!ok) {
				return fail(400, {
					card: 'plex' as const,
					message: 'Could not connect to Plex with this server URL and token.'
				});
			}
		}

		await updateAppSettings({
			plexServerUrl: plexServerUrl || null,
			plexToken: plexToken || null,
			plexWebhookToken: plexWebhookToken || null,
			plexClientIdentifier: plexClientIdentifier || null
		});

		return { card: 'plex' as const, success: true };
	},

	saveMetadata: async (event) => {
		requireAdmin(event);
		const form = await event.request.formData();

		const tmdbReadAccessToken = str(form, 'tmdbReadAccessToken');
		const tvdbApiKey = str(form, 'tvdbApiKey');

		if (tmdbReadAccessToken && !(await verifyTmdbToken(tmdbReadAccessToken))) {
			return fail(400, {
				card: 'metadata' as const,
				message: 'This does not look like a valid TMDB Read Access Token.'
			});
		}

		if (tvdbApiKey && !(await verifyTvdbKey(tvdbApiKey))) {
			return fail(400, {
				card: 'metadata' as const,
				message: 'This does not look like a valid TVDB API key.'
			});
		}

		await updateAppSettings({
			tmdbReadAccessToken: tmdbReadAccessToken || null,
			tvdbApiKey: tvdbApiKey || null
		});

		return { card: 'metadata' as const, success: true };
	},

	setAccentColor: async (event) => {
		requireAdmin(event);
		const form = await event.request.formData();
		const value = str(form, 'accentColor');
		if (!isAccentColor(value)) return fail(400, { message: 'Invalid accent color' });
		await updateAppSettings({ accentColor: value });
		return { success: true };
	},

	setTwentyFourHourTime: async (event) => {
		requireAdmin(event);
		const form = await event.request.formData();
		await updateAppSettings({ twentyFourHourTime: str(form, 'value') === 'true' });
		return { success: true };
	}
};
