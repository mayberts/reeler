<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';

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
	<p>Nothing in this list yet.</p>
{:else}
	<ul class="items">
		{#each data.list.items as item (item.id)}
			<li>
				<span class="title"
					>{item.mediaItem.title}{item.mediaItem.year ? ` (${item.mediaItem.year})` : ''}</span
				>
				{#if data.isOwner}
					<form method="POST" action="?/removeItem" use:enhance>
						<input type="hidden" name="listItemId" value={item.id} />
						<button type="submit">Remove</button>
					</form>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

{#if data.isOwner}
	<h2>Add to this list</h2>
	<form class="search" method="GET">
		<input type="search" name="q" placeholder="Search your library…" value={data.query} />
		<button type="submit">Search</button>
	</form>

	{#if data.query}
		{#if data.searchResults.length === 0}
			<p>No matches.</p>
		{:else}
			<ul class="items">
				{#each data.searchResults as item (item.id)}
					<li>
						<span class="title">{item.title}{item.year ? ` (${item.year})` : ''}</span>
						<form method="POST" action="?/addItem" use:enhance>
							<input type="hidden" name="mediaItemId" value={item.id} />
							<button type="submit">Add</button>
						</form>
					</li>
				{/each}
			</ul>
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
	.items {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.items li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0.4rem 0;
		border-bottom: 1px solid light-dark(#eee, #2a2a2a);
	}
	.search {
		display: flex;
		gap: 0.5rem;
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
		color: light-dark(#b91c1c, #f87171);
	}
	.error {
		color: light-dark(#b91c1c, #f87171);
	}
</style>
