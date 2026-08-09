<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<h1>Ratings</h1>
<p>Rate anything in your synced library — it writes back to Plex automatically.</p>

{#if form?.message}
	<p class="error">{form.message}</p>
{/if}

<form class="search" method="GET">
	<input type="search" name="q" placeholder="Search your library…" value={data.query} />
	<button type="submit">Search</button>
</form>

{#if data.query}
	<section>
		<h2>Results for "{data.query}"</h2>
		{#if data.searchResults.length === 0}
			<p>No matches.</p>
		{:else}
			<ul class="items">
				{#each data.searchResults as item (item.id)}
					<li>
						<span class="title">{item.title}{item.year ? ` (${item.year})` : ''}</span>
						<form method="POST" action="?/rate" use:enhance>
							<input type="hidden" name="mediaItemId" value={item.id} />
							<input type="number" name="value" min="0" max="10" step="1" placeholder="0-10" />
							<button type="submit">Rate</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<section>
	<h2>Your ratings</h2>
	{#if data.ratings.length === 0}
		<p>Nothing rated yet — search above to rate something.</p>
	{:else}
		<ul class="items">
			{#each data.ratings as rating (rating.id)}
				<li>
					<span class="title"
						>{rating.mediaItem.title}{rating.mediaItem.year
							? ` (${rating.mediaItem.year})`
							: ''}</span
					>
					<form method="POST" action="?/rate" use:enhance>
						<input type="hidden" name="mediaItemId" value={rating.mediaItemId} />
						<input type="number" name="value" min="0" max="10" step="1" value={rating.value} />
						<button type="submit">Update</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.search {
		display: flex;
		gap: 0.5rem;
		margin: 1.5rem 0;
	}
	.search input {
		flex: 1;
		max-width: 24rem;
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
		padding: 0.5rem 0;
		border-bottom: 1px solid light-dark(#eee, #2a2a2a);
	}
	.items form {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.items input[type='number'] {
		width: 4rem;
	}
	.error {
		color: light-dark(#b91c1c, #f87171);
	}
</style>
