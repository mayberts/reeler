import { redirect } from '@sveltejs/kit';
import { deleteSession, clearSessionCookie, SESSION_COOKIE_NAME } from '$lib/server/auth/session';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ cookies }) => {
		const sessionId = cookies.get(SESSION_COOKIE_NAME);
		if (sessionId) await deleteSession(sessionId);
		clearSessionCookie(cookies);
		redirect(303, '/login');
	}
};
