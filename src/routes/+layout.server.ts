import { getAppSettings } from '$lib/server/settings';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Cheap (single indexed-PK row) and needed on every page for accent-color theming and
	// the 24-hour time format toggle, so it lives in the root layout rather than being
	// re-fetched per-route.
	const { accentColor, twentyFourHourTime } = await getAppSettings();
	return { user: locals.user, accentColor, twentyFourHourTime };
};
