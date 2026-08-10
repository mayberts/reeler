<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';

	interface Props {
		entryId: string;
		mediaItemId: string;
		title: string;
		year: number | null;
		type: string;
		hasArtwork: boolean;
		watchedAt: Date;
		source: string;
		rating: number | null;
	}

	let { entryId, mediaItemId, title, year, type, hasArtwork, watchedAt, source, rating }: Props =
		$props();

	const posterSrc = $derived(hasArtwork ? `/api/media/${mediaItemId}/poster` : null);
	const timeLabel = $derived(
		watchedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
	);

	let removed = $state(false);
</script>

{#if !removed}
	<div class="row">
		<a class="poster-link" href={resolve('/media/[id]', { id: mediaItemId })}>
			<div class="poster">
				{#if posterSrc}
					<img src={posterSrc} alt="" loading="lazy" />
				{:else}
					<div class="placeholder" aria-hidden="true">{title.charAt(0).toUpperCase()}</div>
				{/if}
			</div>
		</a>
		<div class="content">
			<div class="top-row">
				<div class="badges">
					<span class="time-badge">{timeLabel}</span>
					{#if rating !== null}
						<span class="rating-badge">★ {rating}</span>
					{/if}
					<span class="source-badge">{source}</span>
				</div>
				<form
					method="POST"
					action="?/removeEntry"
					use:enhance={() => {
						removed = true;
						return async () => {};
					}}
				>
					<input type="hidden" name="entryId" value={entryId} />
					<button type="submit" class="remove-btn" title="Remove this entry" aria-label="Remove">
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							><polyline points="3 6 5 6 21 6" /><path
								d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"
							/></svg
						>
					</button>
				</form>
			</div>
			<a class="title-link" href={resolve('/media/[id]', { id: mediaItemId })}>
				<span class="title">{title}</span>
			</a>
			<span class="meta">{type}{year ? ` · ${year}` : ''}</span>
		</div>
	</div>
{/if}

<style>
	.row {
		display: flex;
		gap: 1rem;
		padding: 0.75rem;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: var(--surface-raised);
	}
	.poster-link {
		flex-shrink: 0;
		display: block;
	}
	.poster {
		width: 3.5rem;
		aspect-ratio: 2 / 3;
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: light-dark(#e5e4df, #232322);
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
		font-weight: 600;
		opacity: 0.35;
	}
	.content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.top-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.badges {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
	}
	.time-badge,
	.source-badge {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.15rem 0.4rem;
		border-radius: var(--radius-sm);
		background: var(--border);
		color: var(--ink-muted);
	}
	.rating-badge {
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--accent);
	}
	.remove-btn {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		border-radius: var(--radius-sm);
		color: var(--ink-muted);
	}
	.remove-btn svg {
		width: 0.8rem;
		height: 0.8rem;
	}
	.remove-btn:hover {
		color: var(--danger);
		border-color: var(--danger);
	}
	.title-link {
		color: inherit;
		text-decoration: none;
	}
	.title {
		font-weight: 700;
		display: -webkit-box;
		-webkit-line-clamp: 1;
		line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.title-link:hover .title {
		text-decoration: underline;
	}
	.meta {
		font-size: 0.75rem;
		color: var(--ink-muted);
		text-transform: capitalize;
	}
</style>
