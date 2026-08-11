<script lang="ts">
	import { resolve } from '$app/paths';
	import MediaCard from '$lib/components/MediaCard.svelte';

	let { data } = $props();

	const nextUpTop = $derived(data.nextUp[0] ?? null);

	function pad(n: number | null) {
		return String(n ?? 0).padStart(2, '0');
	}

	function episodeBadge(episode: { seasonNumber: number | null; episodeNumber: number | null }) {
		return `S${pad(episode.seasonNumber)}E${pad(episode.episodeNumber)}`;
	}

	// The hero backdrop for a Next Up pick prefers the episode's own art (a real Plex
	// episode nearly always has one) and falls back to the show's — either can still be
	// missing (e.g. a manually-logged or not-yet-fully-synced show), in which case the
	// hero just renders without an image, same as the random-pick fallback below when
	// the library has no backdrops at all.
	const backdropId = $derived.by(() => {
		if (nextUpTop) {
			const { episode, show } = nextUpTop;
			if (episode.plexArt || episode.backdropUrl) return episode.id;
			if (show.plexArt || show.backdropUrl) return show.id;
			return null;
		}
		return data.heroItem?.id ?? null;
	});
	const backdropSrc = $derived(backdropId ? `/api/media/${backdropId}/backdrop` : null);
</script>

<div class="hero" class:has-backdrop={!!backdropSrc}>
	{#if backdropSrc}
		<img class="backdrop" src={backdropSrc} alt="" />
		<div class="scrim"></div>
	{/if}
	{#if nextUpTop}
		<a class="see-all" href={resolve('/shows')}>See all &rarr;</a>
	{/if}
	<div class="hero-text">
		{#if nextUpTop}
			<span class="episode-badge">{episodeBadge(nextUpTop.episode)}</span>
			<h1>{nextUpTop.show.title}</h1>
			<p class="hero-subtitle">{nextUpTop.episode.title}</p>
		{:else}
			<h1>Dashboard</h1>
		{/if}
	</div>
</div>

{#if data.nextUp.length > 0}
	<h2 class="section-headline">Next Up</h2>
	<div class="scroll-row">
		{#each data.nextUp as item (item.episode.id)}
			<MediaCard
				id={item.episode.id}
				title={item.show.title}
				meta={item.episode.title}
				type={episodeBadge(item.episode)}
				hasArtwork={!!(item.episode.plexThumb || item.episode.artworkUrl)}
				myLists={data.myLists}
			/>
		{/each}
	</div>
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
		Nothing watched yet — {#if data.user?.isAdmin}run a sync from <a href={resolve('/settings')}
				>Settings</a
			>{:else}ask an admin to run a sync{/if} once your Plex account has some history.
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
		display: flex;
		align-items: flex-end;
		min-height: clamp(16rem, 34vw, 28rem);
		padding: 1.5rem;
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
			light-dark(rgba(255, 255, 255, 0.15), rgba(0, 0, 0, 0.25)) 45%,
			light-dark(rgba(255, 255, 255, 0.85), rgba(0, 0, 0, 0.82)) 100%
		);
		z-index: 1;
	}
	.hero-text {
		position: relative;
		z-index: 2;
	}
	.hero-text h1 {
		margin: 0 0 0.3rem;
	}
	.hero.has-backdrop .hero-text h1 {
		text-shadow: 0 2px 12px rgba(0, 0, 0, 0.7);
	}
	.episode-badge {
		display: inline-block;
		padding: 0.25rem 0.6rem;
		border-radius: var(--radius-sm);
		background: light-dark(rgba(255, 255, 255, 0.85), rgba(0, 0, 0, 0.55));
		color: var(--accent);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		margin-bottom: 0.6rem;
	}
	.hero-subtitle {
		margin: 0;
		color: var(--ink-secondary);
	}
	.hero.has-backdrop .hero-subtitle {
		text-shadow: 0 1px 8px rgba(0, 0, 0, 0.6);
	}
	.see-all {
		position: absolute;
		top: 1.5rem;
		right: 1.5rem;
		z-index: 2;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--ink-secondary);
		text-decoration: none;
		text-shadow: 0 1px 8px rgba(0, 0, 0, 0.6);
	}
	.see-all:hover {
		color: var(--accent);
	}
</style>
