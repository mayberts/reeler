import { error, fail, redirect } from '@sveltejs/kit';
import { getVisibleLists, createList } from '$lib/server/lists';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) error(401, 'Not authenticated');

	return { lists: await getVisibleLists(locals.user.id) };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) return fail(401);

		const form = await request.formData();
		const name = form.get('name');
		const description = form.get('description');
		const isShared = form.get('isShared') === 'on';

		if (typeof name !== 'string' || name.trim() === '') {
			return fail(400, { message: 'List name is required' });
		}

		const list = await createList(
			locals.user.id,
			name.trim(),
			typeof description === 'string' && description.trim() ? description.trim() : null,
			isShared
		);

		redirect(303, `/lists/${list.id}`);
	}
};
