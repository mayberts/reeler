<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<h1>Watch history</h1>

{#if data.history.length === 0}
	<p>Nothing watched yet — run a sync from the dashboard, or watch something in Plex.</p>
{:else}
	<ul class="history">
		{#each data.history as entry (entry.id)}
			<li>
				<span class="title"
					>{entry.mediaItem.title}{entry.mediaItem.year ? ` (${entry.mediaItem.year})` : ''}</span
				>
				<span class="meta">
					<span class="source">{entry.source}</span>
					<span class="date">{entry.watchedAt.toLocaleString()}</span>
				</span>
			</li>
		{/each}
	</ul>
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
			<p>No matches.</p>
		{:else}
			<ul class="items">
				{#each data.logResults as result (result.tmdbId)}
					<li>
						<span class="title">{result.title}{result.year ? ` (${result.year})` : ''}</span>
						<form method="POST" action="?/logManual" use:enhance>
							<input type="hidden" name="tmdbId" value={result.tmdbId} />
							<input type="hidden" name="title" value={result.title} />
							<input type="hidden" name="year" value={result.year ?? ''} />
							<input type="hidden" name="mediaType" value={result.mediaType} />
							<input type="date" name="watchedAt" />
							<button type="submit">Log as watched</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
{/if}

<style>
	.history {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.history li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid light-dark(#eee, #2a2a2a);
	}
	.meta {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		font-size: 0.85rem;
		opacity: 0.7;
	}
	.source {
		text-transform: uppercase;
		font-size: 0.7rem;
		letter-spacing: 0.03em;
		border: 1px solid currentColor;
		border-radius: 0.25rem;
		padding: 0.05rem 0.35rem;
	}
	.hint {
		opacity: 0.7;
		font-size: 0.9rem;
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
	.items form {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.success {
		color: light-dark(#15803d, #4ade80);
	}
	.error {
		color: light-dark(#b91c1c, #f87171);
	}
</style>
