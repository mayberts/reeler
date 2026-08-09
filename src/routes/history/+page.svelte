<script lang="ts">
	import { enhance } from '$app/forms';
	import MediaCard from '$lib/components/MediaCard.svelte';

	let { data, form } = $props();
</script>

<h1>Watch history</h1>

{#if data.history.length === 0}
	<p class="empty">
		Nothing watched yet — run a sync from the dashboard, or watch something in Plex.
	</p>
{:else}
	<div class="card-grid">
		{#each data.history as entry (entry.id)}
			<MediaCard
				id={entry.mediaItem.id}
				title={entry.mediaItem.title}
				year={entry.mediaItem.year}
				hasArtwork={!!(entry.mediaItem.plexThumb || entry.mediaItem.artworkUrl)}
				meta="{entry.source} · {entry.watchedAt.toLocaleDateString()}"
			/>
		{/each}
	</div>
{/if}

<h2>Log something not in Plex</h2>

{#if !data.tmdbEnabled}
	<p class="hint">
		Manual logging needs a TMDb API key — set <code>TMDB_API_KEY</code> to enable it (see
		<code>.env.example</code>).
	</p>
{:else}
	{#if form?.loggedSuccess}
		<p class="success">Logged.</p>
	{:else if form?.message}
		<p class="error">{form.message}</p>
	{/if}

	<form class="search" method="GET">
		<input type="search" name="logQuery" placeholder="Search movies & TV…" value={data.logQuery} />
		<button type="submit">Search</button>
	</form>

	{#if data.logQuery}
		{#if data.logResults.length === 0}
			<p class="empty">No matches.</p>
		{:else}
			<div class="card-grid">
				{#each data.logResults as result (result.tmdbId)}
					<div class="result">
						<MediaCard title={result.title} year={result.year} posterUrl={result.posterUrl} />
						<form method="POST" action="?/logManual" use:enhance>
							<input type="hidden" name="tmdbId" value={result.tmdbId} />
							<input type="hidden" name="title" value={result.title} />
							<input type="hidden" name="year" value={result.year ?? ''} />
							<input type="hidden" name="mediaType" value={result.mediaType} />
							<input type="hidden" name="posterUrl" value={result.posterUrl ?? ''} />
							<input type="date" name="watchedAt" />
							<button type="submit">Log</button>
						</form>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
{/if}

<style>
	.hint {
		opacity: 0.7;
		font-size: 0.9rem;
	}
	.search {
		margin: 1rem 0;
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
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.result input[type='date'] {
		flex: 1;
		min-width: 0;
	}
	.success {
		color: var(--success);
	}
	.error {
		color: var(--danger);
	}
</style>
