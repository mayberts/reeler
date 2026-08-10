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
		/** Square (1:1) artwork instead of the default 2:3 poster — album covers, not posters. */
		square?: boolean;
		/** Small badge in the info footer — pass on grids that mix media types (dashboard, history, ratings, lists). */
		type?: string;
	}

	let {
		id,
		title,
		year,
		hasArtwork = false,
		posterUrl = null,
		meta,
		watched = false,
		square = false,
		type
	}: Props = $props();

	const imgSrc = $derived(posterUrl ?? (hasArtwork && id ? `/api/media/${id}/poster` : null));
</script>

{#snippet content()}
	<div class="poster" class:square>
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
		<div class="info-row">
			<span class="sub">{year ?? ''}{year && meta ? ' · ' : ''}{meta ?? ''}</span>
			{#if type}<span class="type-badge">{type}</span>{/if}
		</div>
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
		width: 100%;
		border-radius: var(--radius);
		overflow: hidden;
		background: var(--surface-raised);
		border: 1px solid var(--border);
		color: inherit;
		text-decoration: none;
		transition:
			border-color 0.2s ease,
			box-shadow 0.2s ease,
			transform 0.2s ease;
	}
	a.card:hover {
		border-color: var(--accent);
		box-shadow: 0 12px 28px -10px rgba(0, 0, 0, 0.45);
		transform: translateY(-3px);
	}
	a.card:active {
		transform: scale(0.97);
	}
	.poster {
		position: relative;
		aspect-ratio: 2 / 3;
		overflow: hidden;
		background: light-dark(#e5e4df, #232322);
	}
	.poster.square {
		aspect-ratio: 1 / 1;
	}
	.poster img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		transition: transform 0.4s ease;
	}
	a.card:hover .poster img {
		transform: scale(1.06);
	}
	.watched-badge {
		position: absolute;
		top: 0.4rem;
		right: 0.4rem;
		width: 1.4rem;
		height: 1.4rem;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		font-weight: 700;
		border-radius: 50%;
		background: var(--success);
		color: var(--accent-ink);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
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
		gap: 0.3rem;
		padding: 0.65rem 0.75rem 0.75rem;
	}
	.title {
		font-size: 0.9rem;
		font-weight: 700;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.info-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
	}
	.sub {
		font-size: 0.75rem;
		color: var(--ink-muted);
	}
	.type-badge {
		font-size: 0.6rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 0.15rem 0.4rem;
		border-radius: 999px;
		background: var(--border);
		color: var(--ink-muted);
		flex-shrink: 0;
	}
</style>
