<script lang="ts">
	interface ListOption {
		id: string;
		name: string;
	}

	interface Props {
		id: string;
		trackNumber: number | null;
		title: string;
		runtimeLabel: string | null;
		played: boolean;
		myRating: number | null;
		myLists?: ListOption[];
	}

	let {
		id,
		trackNumber,
		title,
		runtimeLabel,
		played,
		myRating: initialRating,
		myLists = []
	}: Props = $props();

	let myRating = $state(initialRating);
	let rateOpen = $state(false);
	let ratePending = $state(false);
	let ratingInput = $state(initialRating ?? 0);

	let listOpen = $state(false);
	let listPending = $state(false);
	let listDone = $state(false);

	async function submitRating() {
		if (ratePending) return;
		const value = Math.round(ratingInput);
		if (!Number.isInteger(value) || value < 0 || value > 10) return;
		ratePending = true;
		try {
			const res = await fetch(`/api/media/${id}/rate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ value })
			});
			if (res.ok) {
				myRating = value;
				rateOpen = false;
			}
		} finally {
			ratePending = false;
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

<li class="track-row" class:played>
	<span class="track-number">{trackNumber ?? ''}</span>
	<span class="track-title">{title}</span>
	{#if runtimeLabel}<span class="track-duration">{runtimeLabel}</span>{/if}
	{#if played}
		<svg
			class="played-icon"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-label="Played"><path d="M20 6 9 17l-5-5" /></svg
		>
	{/if}

	<div class="track-actions">
		<div class="action rate-action" class:active={myRating !== null}>
			{#if rateOpen}
				<input
					type="number"
					min="0"
					max="10"
					step="1"
					bind:value={ratingInput}
					disabled={ratePending}
					onkeydown={(e) => e.key === 'Enter' && submitRating()}
				/>
				<button type="button" disabled={ratePending} onclick={submitRating} title="Save rating">
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg
					>
				</button>
			{:else}
				<button type="button" onclick={() => (rateOpen = true)} title="Rate this track">
					<svg
						viewBox="0 0 24 24"
						fill={myRating !== null ? 'currentColor' : 'none'}
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><polygon
							points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
						/></svg
					>
					<span>{myRating !== null ? myRating : 'Rate'}</span>
				</button>
			{/if}
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
</li>

<style>
	.track-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.55rem 0.75rem;
		border-radius: var(--radius-sm);
	}
	.track-row.played {
		background: var(--surface-raised);
	}
	.track-number {
		flex-shrink: 0;
		width: 1.5rem;
		text-align: right;
		font-variant-numeric: tabular-nums;
		color: var(--ink-muted);
		font-size: 0.85rem;
	}
	.track-title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.track-duration {
		flex-shrink: 0;
		color: var(--ink-muted);
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
	}
	.played-icon {
		flex-shrink: 0;
		width: 1rem;
		height: 1rem;
		color: var(--accent);
	}
	.track-actions {
		flex-shrink: 0;
		display: flex;
		gap: 0.4rem;
	}
	.action button,
	.action select {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.25rem 0.55rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-strong);
		background: transparent;
		color: var(--ink-muted);
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		cursor: pointer;
	}
	.action select {
		font-size: 0.72rem;
		text-transform: none;
		letter-spacing: normal;
		max-width: 8rem;
	}
	.rate-action input[type='number'] {
		width: 3rem;
		padding: 0.25rem 0.4rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--ink-primary);
		font-size: 0.75rem;
	}
	.action button svg {
		width: 0.8rem;
		height: 0.8rem;
	}
	.action button:disabled,
	.action select:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.rate-action button:hover:not(:disabled),
	.rate-action.active button {
		background: var(--rate-bg);
		border-color: var(--accent);
		color: var(--accent);
	}
	.list-action button:hover:not(:disabled),
	.list-action.active button {
		background: var(--list-bg);
		border-color: var(--list-color);
		color: var(--list-color);
	}
</style>
