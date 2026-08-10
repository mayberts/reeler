<script lang="ts">
	import MediaCard from './MediaCard.svelte';
	import type { BrowseSort, BrowseWatched } from '$lib/server/media/browse';

	interface Item {
		id: string;
		title: string;
		year: number | null;
		plexThumb: string | null;
		artworkUrl: string | null;
		watched: boolean;
	}

	interface ListOption {
		id: string;
		name: string;
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
		genres: string[];
		watched: BrowseWatched | null;
		availableGenres: string[];
		page: number;
		totalPages: number;
		myLists: ListOption[];
	}

	let {
		heading,
		items,
		total,
		search,
		sort,
		emptyText,
		square = false,
		genres,
		watched,
		availableGenres,
		page,
		totalPages,
		myLists
	}: Props = $props();

	const activeFilterCount = $derived(genres.length + (watched ? 1 : 0));

	// ±2 pages around current, matching Scrob's desktop pagination window.
	const pageNumbers = $derived.by(() => {
		const delta = 2;
		const start = Math.max(1, Math.min(page - delta, totalPages - delta * 2));
		const end = Math.min(totalPages, Math.max(page + delta, delta * 2 + 1));
		const pages: number[] = [];
		for (let p = Math.max(1, start); p <= end; p++) pages.push(p);
		return pages;
	});

	/**
	 * GET forms rebuild their query string from current field values regardless of what's
	 * written in the action/formaction attribute, so "clear filters" has to actually reset
	 * the fields before submitting rather than just pointing at a plain URL.
	 */
	function clearFilters(event: MouseEvent) {
		const form = (event.currentTarget as HTMLElement).closest('form');
		if (!form) return;
		form
			.querySelectorAll<HTMLInputElement>('input[name="genre"]')
			.forEach((input) => (input.checked = false));
		form
			.querySelectorAll<HTMLInputElement>('input[name="watched"]')
			.forEach((input) => (input.checked = input.value === ''));
		form.requestSubmit();
	}
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

		{#if availableGenres.length > 0}
			<details class="filters">
				<summary>
					Filters
					{#if activeFilterCount > 0}<span class="filter-count">{activeFilterCount}</span>{/if}
				</summary>
				<div class="filters-panel">
					<fieldset>
						<legend>Genre</legend>
						{#each availableGenres as genre (genre)}
							<label>
								<input
									type="checkbox"
									name="genre"
									value={genre}
									checked={genres.includes(genre)}
								/>
								{genre}
							</label>
						{/each}
					</fieldset>
					<fieldset>
						<legend>Watched</legend>
						<label>
							<input type="radio" name="watched" value="" checked={watched === null} /> Any
						</label>
						<label>
							<input type="radio" name="watched" value="watched" checked={watched === 'watched'} />
							Watched
						</label>
						<label>
							<input
								type="radio"
								name="watched"
								value="unwatched"
								checked={watched === 'unwatched'}
							/>
							Unwatched
						</label>
					</fieldset>
					{#if activeFilterCount > 0}
						<div class="filters-actions">
							<button type="button" onclick={clearFilters}>Clear all</button>
						</div>
					{/if}
				</div>
			</details>
		{/if}

		<button type="submit" class="primary">Filter</button>

		{#if totalPages > 1}
			<div class="pagination">
				{#if page > 1}
					<button type="submit" name="page" value={page - 1} aria-label="Previous page">
						&larr;
					</button>
				{/if}
				{#if pageNumbers[0] > 1}
					<button type="submit" name="page" value={1}>1</button>
					{#if pageNumbers[0] > 2}<span class="ellipsis">…</span>{/if}
				{/if}
				{#each pageNumbers as p (p)}
					<button type="submit" name="page" value={p} class:current={p === page}>{p}</button>
				{/each}
				{#if pageNumbers[pageNumbers.length - 1] < totalPages}
					{#if pageNumbers[pageNumbers.length - 1] < totalPages - 1}<span class="ellipsis">…</span
						>{/if}
					<button type="submit" name="page" value={totalPages}>{totalPages}</button>
				{/if}
				{#if page < totalPages}
					<button type="submit" name="page" value={page + 1} aria-label="Next page">
						&rarr;
					</button>
				{/if}
			</div>
		{/if}
	</form>
</div>

{#if items.length === 0}
	<p class="empty">{search || activeFilterCount > 0 ? 'No matches.' : emptyText}</p>
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
				{myLists}
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
	.filters {
		position: relative;
	}
	.filters summary {
		list-style: none;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 0.9rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-strong);
		background: var(--surface-raised);
		cursor: pointer;
		font-weight: 600;
		font-size: 0.9rem;
	}
	.filters summary::-webkit-details-marker {
		display: none;
	}
	.filter-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.1rem;
		height: 1.1rem;
		padding: 0 0.3rem;
		border-radius: 999px;
		background: var(--accent);
		color: var(--accent-ink);
		font-size: 0.7rem;
		font-weight: 700;
	}
	.filters-panel {
		position: absolute;
		top: calc(100% + 0.4rem);
		right: 0;
		z-index: 10;
		width: 18rem;
		max-height: 24rem;
		overflow-y: auto;
		background: var(--surface-raised);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		padding: 1rem;
		box-shadow: 0 16px 32px -12px rgba(0, 0, 0, 0.5);
	}
	.filters-panel fieldset {
		border: none;
		padding: 0;
		margin: 0 0 1rem;
	}
	.filters-panel legend {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-muted);
		margin-bottom: 0.5rem;
		padding: 0;
	}
	.filters-panel label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		padding: 0.3rem 0;
		font-weight: 400;
		color: var(--ink-primary);
	}
	.filters-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 0.5rem;
	}
	.pagination {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}
	.pagination button {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 2.25rem;
		height: 2.25rem;
		padding: 0 0.5rem;
		font-weight: 700;
		font-size: 0.85rem;
	}
	.pagination button.current {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
	}
	.ellipsis {
		color: var(--ink-muted);
		padding: 0 0.2rem;
	}
</style>
