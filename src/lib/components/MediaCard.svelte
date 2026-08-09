<script lang="ts">
	import { resolve } from '$app/paths';

	interface Props {
		/** Required to show artwork via the poster proxy (`hasArtwork`) and to link to the detail page; optional if `posterUrl` is given instead (e.g. a not-yet-logged TMDb search result, which has no detail page yet). */
		id?: string;
		title: string;
		year?: number | null;
		/** Set when the underlying media_items row has plexThumb/artworkUrl — fetches via the poster proxy. */
		hasArtwork?: boolean;
		/** Overrides `hasArtwork`/`id`: a public URL to use directly (e.g. a not-yet-logged TMDb search result). */
		posterUrl?: string | null;
		meta?: string;
		/** Shows a small "seen" checkmark badge over the poster — used by the browse-grid pages. */
		watched?: boolean;
	}

	let {
		id,
		title,
		year,
		hasArtwork = false,
		posterUrl = null,
		meta,
		watched = false
	}: Props = $props();

	const imgSrc = $derived(posterUrl ?? (hasArtwork && id ? `/api/media/${id}/poster` : null));
</script>

{#snippet content()}
	<div class="poster">
		{#if imgSrc}
			<img src={imgSrc} alt="" loading="lazy" />
		{:else}
			<div class="placeholder" aria-hidden="true">{title.charAt(0).toUpperCase()}</div>
		{/if}
		{#if watched}
			<span class="watched-badge" title="Watched">✓</span>
		{/if}
	</div>
	<div class="info">
		<span class="title">{title}</span>
		{#if year || meta}
			<span class="sub">{year ?? ''}{year && meta ? ' · ' : ''}{meta ?? ''}</span>
		{/if}
	</div>
{/snippet}

{#if id}
	<a class="card" href={resolve('/media/[id]', { id })}>{@render content()}</a>
{:else}
	<div class="card">{@render content()}</div>
{/if}

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		width: 100%;
		color: inherit;
		text-decoration: none;
	}
	a.card:hover .poster {
		outline: 2px solid var(--border-strong);
		outline-offset: 1px;
	}
	.poster {
		position: relative;
		aspect-ratio: 2 / 3;
		border-radius: 0.4rem;
		overflow: hidden;
		background: light-dark(#e5e4df, #232322);
	}
	.watched-badge {
		position: absolute;
		top: 0.35rem;
		right: 0.35rem;
		width: 1.25rem;
		height: 1.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.7rem;
		font-weight: 700;
		border-radius: 50%;
		background: var(--success);
		color: var(--accent-ink);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
	}
	.poster img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2rem;
		font-weight: 600;
		opacity: 0.35;
	}
	.info {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.title {
		font-size: 0.9rem;
		font-weight: 600;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.sub {
		font-size: 0.75rem;
		opacity: 0.6;
	}
</style>
