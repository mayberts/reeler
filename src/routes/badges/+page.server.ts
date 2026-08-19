import { error } from '@sveltejs/kit';
import { getBadgeProgress } from '$lib/server/badges/compute';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) error(401, 'Not authenticated');

	const badges = await getBadgeProgress(locals.user.id);

	const unlocked = badges.filter((b) => b.tierIndex > 0);
	const recentlyUnlocked = [...unlocked]
		.sort((a, b) => (b.unlockedAt?.getTime() ?? 0) - (a.unlockedAt?.getTime() ?? 0))
		.slice(0, 6);

	return {
		badges,
		unlockedCount: unlocked.length,
		totalCount: badges.length,
		recentlyUnlocked
	};
};
