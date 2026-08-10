import { error } from '@sveltejs/kit';
import {
	browseMediaByType,
	isBrowseSort,
	isBrowseWatched,
	listAvailableGenres
} from '$lib/server/media/browse';
import { getOwnedLists } from '$lib/server/lists';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Not authenticated');

	const search = url.searchParams.get('q') ?? '';
	const sortParam = url.searchParams.get('sort');
	const sort = isBrowseSort(sortParam) ? sortParam : 'title';
	const genres = url.searchParams.getAll('genre');
	const watchedParam = url.searchParams.get('watched');
	const watched = isBrowseWatched(watchedParam) ? watchedParam : null;
	const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);

	const [{ items, total, page: currentPage, totalPages }, availableGenres, myLists] =
		await Promise.all([
			browseMediaByType('show', locals.user.id, { search, sort, genres, watched, page }),
			listAvailableGenres('show'),
			getOwnedLists(locals.user.id)
		]);

	return {
		items,
		total,
		search,
		sort,
		genres,
		watched,
		page: currentPage,
		totalPages,
		availableGenres,
		myLists
	};
};
