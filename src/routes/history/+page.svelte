<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import MediaCard from '$lib/components/MediaCard.svelte';
	import HistoryRow from '$lib/components/HistoryRow.svelte';

	let { data, form } = $props();

	const dateGroups = $derived.by(() => {
		const groups: { label: string; entries: typeof data.history }[] = [];
		const indexByLabel: Record<string, number> = {};
		for (const entry of data.history) {
			const label = entry.watchedAt.toLocaleDateString(undefined, {
				weekday: 'long',
				month: 'long',
				day: 'numeric',
				year: 'numeric'
			});
			let idx = indexByLabel[label];
			if (idx === undefined) {
				idx = groups.length;
				indexByLabel[label] = idx;
				groups.push({ label, entries: [] });
			}
			groups[idx].entries.push(entry);
		}
		return groups;
	});

	const tabs = [
		{ value: null, label: 'All' },
		{ value: 'movie', label: 'Movies' },
		{ value: 'show', label: 'Shows' },
		{ value: 'music', label: 'Music' }
	] as const;
</script>

<h1>Watch history</h1>

<div class="tabs">
	{#each tabs as tab (tab.value ?? 'all')}
		<a
			href={tab.value ? resolve(`/history?type=${tab.value}` as '/history') : resolve('/history')}
			class:current={data.typeFilter === tab.value}>{tab.label}</a
		>
	{/each}
</div>

{#if data.history.length === 0}
	<p class="empty">
		Nothing watched yet — run a sync from the dashboard, or watch something in Plex.
	</p>
{:else}
	<div class="date-groups">
		{#each dateGroups as group (group.label)}
			<section>
				<h2 class="date-label">{group.label}</h2>
				<div class="rows">
					{#each group.entries as entry (entry.id)}
						<HistoryRow
							entryId={entry.id}
							mediaItemId={entry.mediaItem.id}
							title={entry.mediaItem.title}
							year={entry.mediaItem.year}
							type={entry.mediaItem.type}
							hasArtwork={!!(entry.mediaItem.plexThumb || entry.mediaItem.artworkUrl)}
							watchedAt={entry.watchedAt}
							source={entry.source}
							rating={entry.rating}
							twentyFourHourTime={data.twentyFourHourTime}
						/>
					{/each}
				</div>
			</section>
		{/each}
	</div>

	{#if data.totalPages > 1}
		<form method="GET" class="pagination">
			<input type="hidden" name="type" value={data.typeFilter ?? ''} />
			{#if data.page > 1}
				<button type="submit" name="page" value={data.page - 1} aria-label="Previous page"
					>&larr;</button
				>
			{/if}
			<span class="page-label">Page {data.page} of {data.totalPages}</span>
			{#if data.page < data.totalPages}
				<button type="submit" name="page" value={data.page + 1} aria-label="Next page"
					>&rarr;</button
				>
			{/if}
		</form>
	{/if}
{/if}

<h2 class="section-headline">Log something not in Plex</h2>

{#if !data.manualLogEnabled}
	<p class="hint">
		Manual logging needs a TMDB or TVDB key — set one from the <a href={resolve('/settings')}
			>Settings</a
		> page to enable it.
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
				{#each data.logResults as result (`${result.source}-${result.externalId}`)}
					<div class="result">
						<MediaCard
							title={result.title}
							year={result.year}
							posterUrl={result.posterUrl}
							type={result.source === 'tvdb' ? 'show (TVDB)' : result.mediaType}
						/>
						<form method="POST" action="?/logManual" use:enhance>
							<input type="hidden" name="source" value={result.source} />
							<input type="hidden" name="externalId" value={result.externalId} />
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
	.tabs {
		display: flex;
		gap: 0.4rem;
		margin: 1rem 0 1.5rem;
	}
	.tabs a {
		padding: 0.4rem 0.9rem;
		border-radius: 999px;
		font-size: 0.85rem;
		font-weight: 600;
		text-decoration: none;
		color: var(--ink-secondary);
		background: var(--surface-raised);
		border: 1px solid var(--border);
	}
	.tabs a.current {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
	}
	.date-groups {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}
	.date-label {
		font-size: 0.8rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-muted);
		margin: 0 0 0.75rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--border);
	}
	.rows {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
		gap: 0.6rem;
	}
	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		margin: 2rem 0 1rem;
	}
	.page-label {
		font-size: 0.85rem;
		color: var(--ink-muted);
	}
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
