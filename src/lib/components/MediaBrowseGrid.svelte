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

<div class="header-row">
	<div class="heading">
		<h1>{heading}</h1>
		<span class="count">{total.toLocaleString()} total</span>
	</div>

	<form method="GET" class="controls">
		<input type="search" name="q" placeholder="Filter by title" value={search} />
		<select name="sort" onchange={(event) => event.currentTarget.form?.requestSubmit()}>
			<option value="title" selected={sort === 'title'}>Title (A–Z)</option>
			<option value="year" selected={sort === 'year'}>Year</option>
			<option value="added" selected={sort === 'added'}>Recently added</option>
		</select>
		<button type="submit" class="primary">Filter</button>
	</form>
</div>

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
	.header-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 2rem;
	}
	.heading {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
	}
	.heading h1 {
		margin: 0;
	}
	.count {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--ink-muted);
	}
	.controls input[type='search'] {
		min-width: 12rem;
	}
</style>
