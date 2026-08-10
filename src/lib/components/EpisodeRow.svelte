<script lang="ts">
	import { resolve } from '$app/paths';

	interface ListOption {
		id: string;
		name: string;
	}

	interface Props {
		id: string;
		title: string;
		episodeNumber: number | null;
		summary: string | null;
		airDate: string | null;
		runtimeMinutes: number | null;
		criticRating: number | null;
		hasArtwork: boolean;
		watched?: boolean;
		myLists?: ListOption[];
	}

	let {
		id,
		title,
		episodeNumber,
		summary,
		airDate,
		runtimeMinutes,
		criticRating,
		hasArtwork,
		watched: initialWatched = false,
		myLists = []
	}: Props = $props();

	const detailHref = $derived(resolve('/media/[id]', { id }));
	const thumbSrc = $derived(hasArtwork ? `/api/media/${id}/poster` : null);
	const airDateLabel = $derived(
		airDate
			? new Date(`${airDate}T00:00:00`).toLocaleDateString(undefined, {
					month: 'short',
					day: 'numeric',
					year: 'numeric'
				})
			: null
	);
	const runtimeLabel = $derived(runtimeMinutes ? `${runtimeMinutes} min` : null);

	let watched = $state(initialWatched);
	let watchPending = $state(false);
	let listOpen = $state(false);
	let listPending = $state(false);
	let listDone = $state(false);

	async function markWatched() {
		if (watchPending) return;
		watchPending = true;
		try {
			const res = await fetch(`/api/media/${id}/watch`, { method: 'POST' });
			if (res.ok) watched = true;
		} finally {
			watchPending = false;
		}
	}

	/** Focuses the picker and pops the native dropdown open as soon as it's rendered. */
	function autoOpen(node: HTMLSelectElement) {
		node.focus();
		node.showPicker?.();
	}

	async function addToList(event: Event) {
		const select = event.currentTarget as HTMLSelectElement;
		const listId = select.value;
		if (!listId || listPending) return;
		listPending = true;
		try {
			const res = await fetch(`/api/media/${id}/lists`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ listId })
			});
			if (res.ok) {
				listDone = true;
				listOpen = false;
				select.value = '';
				setTimeout(() => (listDone = false), 1500);
			}
		} finally {
			listPending = false;
		}
	}
</script>

<div class="row" class:watched>
	<a class="thumb-link" href={detailHref}>
		<div class="thumb">
			{#if thumbSrc}
				<img src={thumbSrc} alt="" loading="lazy" />
			{:else}
				<div class="placeholder" aria-hidden="true">{episodeNumber ?? '?'}</div>
			{/if}
		</div>
	</a>

	<div class="content">
		<div class="top-row">
			<div class="heading">
				{#if episodeNumber !== null}<span class="ep-badge">EP {episodeNumber}</span>{/if}
				<span class="title">{title}</span>
			</div>
			{#if criticRating !== null}
				<span class="rating-badge">★ {criticRating.toFixed(1)}</span>
			{/if}
		</div>
		{#if airDateLabel}<span class="air-date">{airDateLabel}</span>{/if}
		{#if summary}<p class="summary">{summary}</p>{/if}
		<div class="bottom-row">
			<a class="detail-link" href={detailHref}>View details</a>
			{#if runtimeLabel}<span class="runtime">{runtimeLabel}</span>{/if}
		</div>

		<div class="action-bar">
			<div class="action watched-action" class:active={watched}>
				<button
					type="button"
					disabled={watchPending}
					onclick={markWatched}
					title={watched ? 'Watched' : 'Mark as watched'}
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle
							cx="12"
							cy="12"
							r="3"
							fill={watched ? 'currentColor' : 'none'}
						/></svg
					>
					<span>Watched</span>
				</button>
			</div>

			{#if myLists.length > 0}
				<div class="action list-action" class:active={listDone}>
					{#if listOpen}
						<select
							use:autoOpen
							disabled={listPending}
							onchange={addToList}
							onblur={() => (listOpen = false)}
						>
							<option value="">Choose a list…</option>
							{#each myLists as list (list.id)}
								<option value={list.id}>{list.name}</option>
							{/each}
						</select>
					{:else}
						<button type="button" onclick={() => (listOpen = true)} title="Add to list">
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line
									x1="8"
									y1="18"
									x2="21"
									y2="18"
								/><line x1="3" y1="6" x2="3.01" y2="6" /><line
									x1="3"
									y1="12"
									x2="3.01"
									y2="12"
								/><line x1="3" y1="18" x2="3.01" y2="18" /></svg
							>
							<span>{listDone ? 'Added' : 'Lists'}</span>
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.row {
		display: flex;
		gap: 1rem;
		padding: 0.85rem;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: var(--surface-raised);
	}
	.row.watched {
		border-color: var(--success);
	}
	.thumb-link {
		flex-shrink: 0;
		display: block;
	}
	.thumb {
		width: 12rem;
		max-width: 30vw;
		aspect-ratio: 16 / 9;
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: light-dark(#e5e4df, #232322);
	}
	.thumb img {
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
		font-size: 1.5rem;
		font-weight: 700;
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
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.heading {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.5rem;
		min-width: 0;
	}
	.ep-badge {
		flex-shrink: 0;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.1rem 0.4rem;
		border-radius: var(--radius-sm);
		background: var(--border);
		color: var(--ink-muted);
	}
	.title {
		font-weight: 700;
	}
	.rating-badge {
		flex-shrink: 0;
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--accent);
	}
	.air-date {
		font-size: 0.75rem;
		color: var(--ink-muted);
	}
	.summary {
		font-size: 0.85rem;
		color: var(--ink-secondary);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.bottom-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.78rem;
	}
	.detail-link {
		color: var(--accent);
		font-weight: 700;
		text-decoration: none;
	}
	.detail-link:hover {
		text-decoration: underline;
	}
	.runtime {
		color: var(--ink-muted);
	}
	.action-bar {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.4rem;
	}
	.action button,
	.action select {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.3rem 0.65rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-strong);
		background: transparent;
		color: var(--ink-muted);
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		cursor: pointer;
	}
	.action select {
		font-size: 0.75rem;
		text-transform: none;
		letter-spacing: normal;
		max-width: 9rem;
	}
	.action button svg {
		width: 0.85rem;
		height: 0.85rem;
	}
	.action button:disabled,
	.action select:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.watched-action button:hover:not(:disabled),
	.watched-action.active button {
		background: var(--success-bg);
		border-color: var(--success);
		color: var(--success);
	}
	.list-action button:hover:not(:disabled),
	.list-action.active button {
		background: var(--list-bg);
		border-color: var(--list-color);
		color: var(--list-color);
	}
</style>
