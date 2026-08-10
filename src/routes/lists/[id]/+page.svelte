<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import MediaCard from '$lib/components/MediaCard.svelte';

	let { data, form } = $props();
</script>

<a href={resolve('/lists')}>&larr; All lists</a>

<h1>{data.list.name}</h1>
{#if data.list.description}
	<p class="description">{data.list.description}</p>
{/if}
<p class="meta">
	by {data.list.owner.username}
	{#if data.list.isShared}<span class="badge">shared</span>{/if}
</p>

{#if form?.message}
	<p class="error">{form.message}</p>
{/if}

{#if data.list.items.length === 0}
	<p class="empty">Nothing in this list yet.</p>
{:else}
	<div class="card-grid">
		{#each data.list.items as item (item.id)}
			<div class="result">
				<MediaCard
					id={item.mediaItem.id}
					title={item.mediaItem.title}
					year={item.mediaItem.year}
					hasArtwork={!!(item.mediaItem.plexThumb || item.mediaItem.artworkUrl)}
					type={item.mediaItem.type}
				/>
				{#if data.isOwner}
					<form method="POST" action="?/removeItem" use:enhance>
						<input type="hidden" name="listItemId" value={item.id} />
						<button type="submit">Remove</button>
					</form>
				{/if}
			</div>
		{/each}
	</div>
{/if}

{#if data.isOwner}
	<h2 class="section-headline">Add to this list</h2>
	<form class="search" method="GET">
		<input type="search" name="q" placeholder="Search your library…" value={data.query} />
		<button type="submit">Search</button>
	</form>

	{#if data.query}
		{#if data.searchResults.length === 0}
			<p class="empty">No matches.</p>
		{:else}
			<div class="card-grid">
				{#each data.searchResults as item (item.id)}
					<div class="result">
						<MediaCard
							id={item.id}
							title={item.title}
							year={item.year}
							hasArtwork={!!(item.plexThumb || item.artworkUrl)}
							type={item.type}
						/>
						<form method="POST" action="?/addItem" use:enhance>
							<input type="hidden" name="mediaItemId" value={item.id} />
							<button type="submit">Add</button>
						</form>
					</div>
				{/each}
			</div>
		{/if}
	{/if}

	<form method="POST" action="?/delete" use:enhance class="delete">
		<button type="submit">Delete this list</button>
	</form>
{/if}

<style>
	.description {
		opacity: 0.8;
	}
	.meta {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		font-size: 0.85rem;
		opacity: 0.7;
		margin-bottom: 1.5rem;
	}
	.badge {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		border: 1px solid currentColor;
		border-radius: 0.25rem;
		padding: 0.05rem 0.35rem;
	}
	.result {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.search {
		margin: 1rem 0;
	}
	.search input {
		flex: 1;
		max-width: 24rem;
	}
	.delete {
		margin-top: 2rem;
	}
	.delete button {
		color: var(--danger);
	}
	.error {
		color: var(--danger);
	}
</style>
