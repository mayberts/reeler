import { error } from '@sveltejs/kit';
import { browseMediaByType, isBrowseSort } from '$lib/server/media/browse';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Not authenticated');

	const search = url.searchParams.get('q') ?? '';
	const sortParam = url.searchParams.get('sort');
	const sort = isBrowseSort(sortParam) ? sortParam : 'title';

	const { items, total } = await browseMediaByType('show', locals.user.id, { search, sort });

	return { items, total, search, sort };
};
