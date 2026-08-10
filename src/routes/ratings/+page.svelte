<script lang="ts">
	import { enhance } from '$app/forms';
	import MediaCard from '$lib/components/MediaCard.svelte';

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
		<h2 class="section-headline">Results for "{data.query}"</h2>
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
						<form method="POST" action="?/rate" use:enhance>
							<input type="hidden" name="mediaItemId" value={item.id} />
							<input type="number" name="value" min="0" max="10" step="1" placeholder="0-10" />
							<button type="submit">Rate</button>
						</form>
					</div>
				{/each}
			</div>
		{/if}
	</section>
{/if}

<section>
	<h2 class="section-headline">Your ratings</h2>
	{#if data.ratings.length === 0}
		<p class="empty">Nothing rated yet — search above to rate something.</p>
	{:else}
		<div class="card-grid">
			{#each data.ratings as rating (rating.id)}
				<div class="result">
					<MediaCard
						id={rating.mediaItemId}
						title={rating.mediaItem.title}
						year={rating.mediaItem.year}
						hasArtwork={!!(rating.mediaItem.plexThumb || rating.mediaItem.artworkUrl)}
						type={rating.mediaItem.type}
					/>
					<form method="POST" action="?/rate" use:enhance>
						<input type="hidden" name="mediaItemId" value={rating.mediaItemId} />
						<input type="number" name="value" min="0" max="10" step="1" value={rating.value} />
						<button type="submit">Update</button>
					</form>
				</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	.search {
		margin: 1.5rem 0;
	}
	.search input {
		flex: 1;
		max-width: 24rem;
	}
	.result {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.result form {
		gap: 0.35rem;
	}
	.result input[type='number'] {
		width: 3.5rem;
	}
	.error {
		color: var(--danger);
	}
</style>
