import { redirect } from '@sveltejs/kit';
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
		} catch (err) {
			console.error('[login] failed to create Plex pin', err);
			redirect(303, '/login?error=plex_unreachable');
		}

		cookies.set(PIN_COOKIE_NAME, String(pin.id), {
			path: '/',
			httpOnly: true,
			secure: url.protocol === 'https:',
			sameSite: 'lax',
			maxAge: 600
		});

		redirect(303, buildAuthUrl(pin, `${url.origin}/login/callback`));
	}
};
