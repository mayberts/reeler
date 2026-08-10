<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';

	interface ListOption {
		id: string;
		name: string;
	}

	interface Props {
		/** Required to show artwork via the poster proxy (`hasArtwork`), to link to the detail page, and to power the action bar; optional if `posterUrl` is given instead (e.g. a not-yet-logged TMDb search result, which has no detail page or actions yet). */
		id?: string;
		title: string;
		year?: number | null;
		/** Set when the underlying media_items row has plexThumb/artworkUrl — fetches via the poster proxy. */
		hasArtwork?: boolean;
		/** Overrides `hasArtwork`/`id`: a public URL to use directly (e.g. a not-yet-logged TMDb search result). */
		posterUrl?: string | null;
		meta?: string;
		/** Initial watched state — the action bar takes over from here with optimistic updates. */
		watched?: boolean;
		/** Hides the watched action — for media types with no meaningful watch status (e.g. albums, where plays are tracked per-track, not per-album). */
		showWatched?: boolean;
		/** Real fraction watched (0-1), for shows — computed from actual episode watches,
		 *  not the item's own watch_history rows (a show never gets one from real Plex
		 *  playback, only its episodes do — see DESIGN.md). When set, the watched action
		 *  becomes a read-only status (percent while partial) instead of a click-to-toggle,
		 *  since a manual toggle on the show itself wouldn't affect this number at all. */
		watchProgress?: number | null;
		/** Square (1:1) artwork instead of the default 2:3 poster — album covers, not posters. */
		square?: boolean;
		/** Small badge in the info footer — pass on grids that mix media types (dashboard, history, ratings, lists). */
		type?: string;
		/** Owned lists this user can add the item to. Omit/empty hides the Lists action. */
		myLists?: ListOption[];
		/** Small corner overlay button on the poster (e.g. "remove from this list") — positioned opposite the top-left rating/badge area. */
		overlay?: Snippet;
	}

	let {
		id,
		title,
		year,
		hasArtwork = false,
		posterUrl = null,
		meta,
		watched: initialWatched = false,
		showWatched = true,
		watchProgress = null,
		square = false,
		type,
		myLists = [],
		overlay
	}: Props = $props();

	const imgSrc = $derived(posterUrl ?? (hasArtwork && id ? `/api/media/${id}/poster` : null));
	const detailHref = $derived(id ? resolve('/media/[id]', { id }) : null);

	let watched = $state(initialWatched);
	let watchPending = $state(false);
	let listOpen = $state(false);
	let listPending = $state(false);
	let listDone = $state(false);

	async function markWatched() {
		if (!id || watchPending) return;
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
		if (!id || !listId || listPending) return;
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

<div class="card">
	{#if detailHref}
		<div class="poster-wrap">
			<a class="poster-link" href={detailHref}>
				<div class="poster" class:square>
					{#if imgSrc}
						<img src={imgSrc} alt="" loading="lazy" />
					{:else}
						<div class="placeholder" aria-hidden="true">{title.charAt(0).toUpperCase()}</div>
					{/if}
					{#if watchProgress !== null && watchProgress > 0 && watchProgress < 1}
						<div class="progress-track">
							<div class="progress-fill" style="width: {watchProgress * 100}%"></div>
						</div>
					{/if}
				</div>
			</a>
			{#if overlay}
				<div class="overlay">{@render overlay()}</div>
			{/if}
		</div>

		<div class="action-bar">
			{#if showWatched}
				<div class="action watched" class:active={watched}>
					{#if watchProgress !== null}
						{@const percent = Math.round(watchProgress * 100)}
						<div
							class="status"
							title={watched ? 'Watched' : watchProgress > 0 ? `${percent}% watched` : 'Unwatched'}
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
							<span>{watched ? 'Watched' : watchProgress > 0 ? `${percent}%` : 'Unwatched'}</span>
						</div>
					{:else}
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
					{/if}
				</div>
			{/if}

			{#if myLists.length > 0}
				<div class="action list" class:active={listDone}>
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

		<a class="info-link" href={detailHref}>
			<div class="info">
				<span class="title">{title}</span>
				<div class="info-row">
					<span class="sub">{year ?? ''}{year && meta ? ' · ' : ''}{meta ?? ''}</span>
					{#if type}<span class="type-badge">{type}</span>{/if}
				</div>
			</div>
		</a>
	{:else}
		<div class="poster" class:square>
			{#if imgSrc}
				<img src={imgSrc} alt="" loading="lazy" />
			{:else}
				<div class="placeholder" aria-hidden="true">{title.charAt(0).toUpperCase()}</div>
			{/if}
		</div>
		<div class="info">
			<span class="title">{title}</span>
			<div class="info-row">
				<span class="sub">{year ?? ''}{year && meta ? ' · ' : ''}{meta ?? ''}</span>
				{#if type}<span class="type-badge">{type}</span>{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.card {
		display: flex;
		flex-direction: column;
		width: 100%;
		border-radius: var(--radius);
		overflow: hidden;
		background: var(--surface-raised);
		border: 1px solid var(--border);
		transition:
			border-color 0.2s ease,
			box-shadow 0.2s ease,
			transform 0.2s ease;
	}
	.card:has(.poster-link:hover),
	.card:has(.info-link:hover) {
		border-color: var(--accent);
		box-shadow: 0 12px 28px -10px rgba(0, 0, 0, 0.45);
		transform: translateY(-3px);
	}
	.poster-link,
	.info-link {
		display: block;
		color: inherit;
		text-decoration: none;
	}
	.poster-wrap {
		position: relative;
	}
	.overlay {
		position: absolute;
		top: 0.4rem;
		right: 0.4rem;
		z-index: 2;
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
	.poster-link:hover .poster img {
		transform: scale(1.06);
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
	.progress-track {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 0.3rem;
		background: rgba(0, 0, 0, 0.45);
	}
	.progress-fill {
		height: 100%;
		background: var(--accent);
	}
	.action-bar {
		position: relative;
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		border-top: 1px solid var(--border);
		border-bottom: 1px solid var(--border);
	}
	.action {
		position: relative;
		border-right: 1px solid var(--border);
	}
	.action:last-child {
		border-right: none;
	}
	.action button,
	.action select,
	.action .status {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.2rem;
		padding: 0.4rem 0.3rem;
		background: transparent;
		border: none;
		border-radius: 0;
		color: var(--ink-muted);
		font-size: 0.6rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		cursor: pointer;
	}
	.action .status {
		cursor: default;
	}
	.action select {
		font-size: 0.7rem;
		text-transform: none;
		letter-spacing: normal;
	}
	.action button svg,
	.action .status svg {
		width: 0.9rem;
		height: 0.9rem;
	}
	.action button:disabled,
	.action select:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.action.watched button:hover:not(:disabled),
	.action.watched.active button,
	.action.watched.active .status {
		background: var(--success-bg);
		color: var(--success);
	}
	.action.list button:hover:not(:disabled),
	.action.list.active button {
		background: var(--list-bg);
		color: var(--list-color);
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
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
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
