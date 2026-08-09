import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { createPin, buildAuthUrl } from '$lib/server/plex/auth';
import { PIN_COOKIE_NAME } from '$lib/server/auth/plex-pin';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) redirect(303, '/');
	return { error: url.searchParams.get('error') };
};

export const actions: Actions = {
	default: async ({ cookies, url }) => {
		let pin;
		try {
			pin = await createPin();
		} catch {
			redirect(303, '/login?error=plex_unreachable');
		}

		cookies.set(PIN_COOKIE_NAME, String(pin.id), {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'lax',
			maxAge: 600
		});

		redirect(303, buildAuthUrl(pin, `${url.origin}/login/callback`));
	}
};
