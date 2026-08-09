<script lang="ts">
	import { enhance } from '$app/forms';
	import MediaCard from '$lib/components/MediaCard.svelte';

	let { data, form } = $props();
	let syncing = $state(false);
</script>

<h1>Dashboard</h1>
<p>
	See <a href="https://github.com/mayberts/reeler/blob/main/DESIGN.md">DESIGN.md</a> for the full roadmap.
</p>

<dl class="stats">
	<div>
		<dt>Users</dt>
		<dd>{data.userCount}</dd>
	</div>
	<div>
		<dt>Media items</dt>
		<dd>{data.mediaCount}</dd>
	</div>
	<div>
		<dt>Watch history entries</dt>
		<dd>{data.historyCount}</dd>
	</div>
</dl>

<form
	method="POST"
	action="?/sync"
	use:enhance={() => {
		syncing = true;
		return async ({ update }) => {
			await update();
			syncing = false;
		};
	}}
>
	<button type="submit" class="primary" disabled={syncing}
		>{syncing ? 'Syncing…' : 'Sync now'}</button
	>
</form>

{#if form?.success}
	<p class="sync-result">
		Synced {form.library.itemsUpserted} library items, {form.history.entriesInserted} new history entries.
	</p>
{:else if form?.message}
	<p class="sync-error">{form.message}</p>
{/if}

<h2>Recent activity</h2>
{#if data.recentHistory.length === 0}
	<p class="empty">
		Nothing watched yet — run a sync above once your Plex account has some history.
	</p>
{:else}
	<div class="card-grid">
		{#each data.recentHistory as entry (entry.id)}
			<MediaCard
				id={entry.mediaItem.id}
				title={entry.mediaItem.title}
				year={entry.mediaItem.year}
				hasArtwork={!!(entry.mediaItem.plexThumb || entry.mediaItem.artworkUrl)}
				meta={entry.watchedAt.toLocaleDateString()}
			/>
		{/each}
	</div>
{/if}

<style>
	.stats {
		display: flex;
		gap: 2.5rem;
		margin: 1.5rem 0;
	}
	.stats dt {
		font-size: 0.85rem;
		opacity: 0.65;
	}
	.stats dd {
		margin: 0;
		font-size: 1.75rem;
		font-weight: 600;
	}
	.sync-result {
		color: var(--success);
	}
	.sync-error {
		color: var(--danger);
	}
</style>
