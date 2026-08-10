import { count, eq, max } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { lists, listItems } from '$lib/server/db/schema';

/**
 * Lists a user can see: their own, plus anything marked shared. Each list carries its
 * total item count and up to 3 preview items (for a stacked-poster thumbnail) — the
 * item count is computed separately from the preview items since the preview is
 * limited to 3 but the count needs to reflect the true total.
 */
export async function getVisibleLists(userId: string) {
	const [visibleLists, counts] = await Promise.all([
		db.query.lists.findMany({
			where: (fields, { eq, or }) => or(eq(fields.ownerId, userId), eq(fields.isShared, true)),
			orderBy: (fields, { desc }) => desc(fields.createdAt),
			with: {
				owner: true,
				items: {
					orderBy: (fields, { asc }) => asc(fields.position),
					limit: 3,
					with: { mediaItem: true }
				}
			}
		}),
		db
			.select({ listId: listItems.listId, count: count() })
			.from(listItems)
			.groupBy(listItems.listId)
	]);

	const countMap = new Map(counts.map((row) => [row.listId, row.count]));
	return visibleLists.map((list) => ({
		...list,
		itemCount: countMap.get(list.id) ?? 0,
		previewItems: list.items.map((item) => item.mediaItem)
	}));
}

/** Lists this user owns (can add items to) — id/name only, for the card action bar's list picker. */
export async function getOwnedLists(userId: string) {
	return db.query.lists.findMany({
		where: eq(lists.ownerId, userId),
		orderBy: (fields, { asc }) => asc(fields.name),
		columns: { id: true, name: true }
	});
}

/** A single list with its items, or null if it doesn't exist or isn't visible to this user. */
export async function getListDetail(listId: string, userId: string) {
	const list = await db.query.lists.findFirst({
		where: eq(lists.id, listId),
		with: {
			owner: true,
			items: {
				with: { mediaItem: true },
				orderBy: (fields, { asc }) => asc(fields.position)
			}
		}
	});
	if (!list) return null;
	if (list.ownerId !== userId && !list.isShared) return null;
	return list;
}

export async function createList(
	ownerId: string,
	name: string,
	description: string | null,
	isShared: boolean
) {
	const [list] = await db
		.insert(lists)
		.values({ ownerId, name, description, isShared })
		.returning();
	return list;
}

export async function deleteList(listId: string, userId: string) {
	const list = await db.query.lists.findFirst({ where: eq(lists.id, listId) });
	if (!list || list.ownerId !== userId) throw new Error('List not found');

	await db.delete(listItems).where(eq(listItems.listId, listId));
	await db.delete(lists).where(eq(lists.id, listId));
}

export async function addListItem(listId: string, userId: string, mediaItemId: string) {
	const list = await db.query.lists.findFirst({ where: eq(lists.id, listId) });
	if (!list || list.ownerId !== userId) throw new Error('List not found');

	const [{ value: maxPosition }] = await db
		.select({ value: max(listItems.position) })
		.from(listItems)
		.where(eq(listItems.listId, listId));

	await db.insert(listItems).values({
		listId,
		mediaItemId,
		position: (maxPosition ?? -1) + 1
	});
}

export async function removeListItem(listItemId: string, userId: string) {
	const item = await db.query.listItems.findFirst({
		where: eq(listItems.id, listItemId),
		with: { list: true }
	});
	if (!item || item.list.ownerId !== userId) throw new Error('List item not found');

	await db.delete(listItems).where(eq(listItems.id, listItemId));
}
