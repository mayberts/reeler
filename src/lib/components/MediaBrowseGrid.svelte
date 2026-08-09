<script lang="ts">
	import MediaCard from './MediaCard.svelte';
	import type { BrowseSort } from '$lib/server/media/browse';

	interface Item {
		id: string;
		title: string;
		year: number | null;
		plexThumb: string | null;
		artworkUrl: string | null;
		watched: boolean;
	}

	interface Props {
		heading: string;
		items: Item[];
		total: number;
		search: string;
		sort: BrowseSort;
		emptyText: string;
		/** Square (1:1) artwork instead of the default 2:3 poster — album covers, not posters. */
		square?: boolean;
	}

	let { heading, items, total, search, sort, emptyText, square = false }: Props = $props();
</script>

<h1>{heading} <span class="count">{total.toLocaleString()} total</span></h1>

<form method="GET" class="controls">
	<input type="search" name="q" placeholder="Filter by title" value={search} />
	<select name="sort" onchange={(event) => event.currentTarget.form?.requestSubmit()}>
		<option value="title" selected={sort === 'title'}>Title (A–Z)</option>
		<option value="year" selected={sort === 'year'}>Year</option>
		<option value="added" selected={sort === 'added'}>Recently added</option>
	</select>
	<button type="submit">Filter</button>
</form>

{#if items.length === 0}
	<p class="empty">{search ? `No matches for "${search}".` : emptyText}</p>
{:else}
	<div class="card-grid">
		{#each items as item (item.id)}
			<MediaCard
				id={item.id}
				title={item.title}
				year={item.year}
				hasArtwork={!!(item.plexThumb || item.artworkUrl)}
				watched={item.watched}
				{square}
			/>
		{/each}
	</div>
{/if}

<style>
	h1 {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
	}
	.count {
		font-size: 0.9rem;
		font-weight: 400;
		color: var(--ink-muted);
	}
	.controls {
		margin-bottom: 0.5rem;
	}
</style>
