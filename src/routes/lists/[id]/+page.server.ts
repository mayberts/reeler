import { error, fail, redirect } from '@sveltejs/kit';
import { like } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mediaItems } from '$lib/server/db/schema';
import { getListDetail, addListItem, removeListItem, deleteList } from '$lib/server/lists';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) error(401, 'Not authenticated');

	const list = await getListDetail(params.id, locals.user.id);
	if (!list) error(404, 'List not found');

	const query = url.searchParams.get('q')?.trim() ?? '';
	const searchResults = query
		? await db.query.mediaItems.findMany({
				where: like(mediaItems.title, `%${query}%`),
				orderBy: (fields, { asc }) => asc(fields.title),
				limit: 20
			})
		: [];

	return {
		list,
		query,
		searchResults,
		isOwner: list.ownerId === locals.user.id
	};
};

export const actions: Actions = {
	addItem: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401);

		const form = await request.formData();
		const mediaItemId = form.get('mediaItemId');
		if (typeof mediaItemId !== 'string') return fail(400, { message: 'Missing media item' });

		try {
			await addListItem(params.id, locals.user.id, mediaItemId);
		} catch (err) {
			console.error('[lists] failed to add item', err);
			return fail(400, { message: 'Could not add item to this list' });
		}

		return { success: true };
	},

	removeItem: async ({ request, locals }) => {
		if (!locals.user) return fail(401);

		const form = await request.formData();
		const listItemId = form.get('listItemId');
		if (typeof listItemId !== 'string') return fail(400, { message: 'Missing item' });

		try {
			await removeListItem(listItemId, locals.user.id);
		} catch (err) {
			console.error('[lists] failed to remove item', err);
			return fail(400, { message: 'Could not remove item' });
		}

		return { success: true };
	},

	delete: async ({ params, locals }) => {
		if (!locals.user) return fail(401);

		try {
			await deleteList(params.id, locals.user.id);
		} catch (err) {
			console.error('[lists] failed to delete list', err);
			return fail(400, { message: 'Could not delete this list' });
		}

		redirect(303, '/lists');
	}
};
