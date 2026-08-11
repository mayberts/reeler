<script lang="ts">
	import { enhance } from '$app/forms';
	import MediaCard from '$lib/components/MediaCard.svelte';

	let { data, form } = $props();
	let syncing = $state(false);

	const backdropSrc = $derived(data.heroItem ? `/api/media/${data.heroItem.id}/backdrop` : null);
</script>

<div class="hero" class:has-backdrop={!!backdropSrc}>
	{#if backdropSrc}
		<img class="backdrop" src={backdropSrc} alt="" />
		<div class="scrim"></div>
	{/if}
	<h1>Dashboard</h1>
</div>

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
		Synced {form.library.itemsUpserted} library items, {form.history.entriesInserted} new history entries{form
			.library.watchedFromViewCount > 0
			? `, ${form.library.watchedFromViewCount} watched status repaired from Plex`
			: ''}{form.repair.fixed > 0 ? `, repaired ${form.repair.fixed} track-to-album links` : ''}.
	</p>
{:else if form?.message}
	<p class="sync-error">{form.message}</p>
{/if}

{#if data.recentMovies.length > 0}
	<h2 class="section-headline">Recently added movies</h2>
	<div class="scroll-row">
		{#each data.recentMovies as item (item.id)}
			<MediaCard
				id={item.id}
				title={item.title}
				year={item.year}
				hasArtwork={!!(item.plexThumb || item.artworkUrl)}
			/>
		{/each}
	</div>
{/if}

{#if data.recentShows.length > 0}
	<h2 class="section-headline">Recently added shows</h2>
	<div class="scroll-row">
		{#each data.recentShows as item (item.id)}
			<MediaCard
				id={item.id}
				title={item.title}
				year={item.year}
				hasArtwork={!!(item.plexThumb || item.artworkUrl)}
			/>
		{/each}
	</div>
{/if}

<h2 class="section-headline">Recent activity</h2>
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
				type={entry.mediaItem.type}
				watched
				myLists={data.myLists}
			/>
		{/each}
	</div>
{/if}

<style>
	.hero {
		position: relative;
		margin: 0 -1.5rem 2rem;
		padding: 2rem 1.5rem;
	}
	.hero.has-backdrop {
		padding: 6rem 1.5rem 2rem;
	}
	.backdrop {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		z-index: 0;
	}
	.scrim {
		position: absolute;
		inset: 0;
		/* Fades from the page background at the very top down to a solid-ish plateau
		   at the bottom, where the heading sits — same `light-dark()`-per-stop approach
		   as the media detail page's hero scrim (see that file for why: this app themes
		   off `prefers-color-scheme` alone, no `[data-theme]` attribute to key a
		   media-query override off). */
		background: linear-gradient(
			180deg,
			var(--surface) 0%,
			light-dark(rgba(255, 255, 255, 0.25), rgba(0, 0, 0, 0.35)) 35%,
			light-dark(rgba(255, 255, 255, 0.8), rgba(0, 0, 0, 0.78)) 100%
		);
		z-index: 1;
	}
	.hero h1 {
		position: relative;
		z-index: 2;
		margin: 0;
	}
	.hero.has-backdrop h1 {
		text-shadow: 0 2px 12px rgba(0, 0, 0, 0.7);
	}
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
