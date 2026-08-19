<script lang="ts">
	import BadgeIcon from '$lib/components/BadgeIcon.svelte';
	import type { BadgeProgress } from '$lib/server/badges/compute';

	let { badge }: { badge: BadgeProgress } = $props();

	let dialogEl: HTMLDialogElement | undefined = $state();

	const progressLabel = $derived(
		badge.nextTarget === null
			? `${badge.currentValue} — maxed out`
			: `${badge.currentValue} / ${badge.nextTarget}`
	);

	const progressPercent = $derived(
		badge.nextTarget === null ? 100 : Math.min(100, (badge.currentValue / badge.nextTarget) * 100)
	);

	function dateLabel(date: Date): string {
		return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
	}

	/** Closes when the backdrop itself (not dialog content) is clicked — the standard
	 *  "click outside to dismiss" pattern for a native `<dialog>`. */
	function onDialogClick(event: MouseEvent) {
		if (event.target === dialogEl) dialogEl?.close();
	}
</script>

<button
	type="button"
	class="badge-card"
	class:unlocked={badge.tierIndex > 0}
	onclick={() => dialogEl?.showModal()}
>
	<div class="badge-card-top">
		<span class="badge-icon" class:unlocked={badge.tierIndex > 0}>
			<BadgeIcon name={badge.icon} />
		</span>
		{#if badge.tierIndex > 0}
			<span class="tier-pill">Tier {badge.tierIndex}/{badge.tierCount}</span>
		{/if}
	</div>
	<p class="badge-name">{badge.name}</p>
	<p class="badge-desc">{badge.description}</p>
	<div class="badge-progress">
		<div class="badge-progress-track">
			<div class="badge-progress-fill" style="width: {progressPercent}%"></div>
		</div>
		<p class="badge-progress-label">{progressLabel}</p>
	</div>
</button>

<dialog bind:this={dialogEl} class="badge-dialog" onclick={onDialogClick}>
	<div class="dialog-content">
		<button type="button" class="dialog-close" onclick={() => dialogEl?.close()} aria-label="Close"
			>&times;</button
		>
		<span class="badge-icon large" class:unlocked={badge.tierIndex > 0}>
			<BadgeIcon name={badge.icon} />
		</span>
		<h3 class="dialog-name">{badge.name}</h3>
		<p class="badge-desc">{badge.description}</p>
		{#if badge.tierIndex > 0}
			<p class="dialog-status">
				Tier {badge.tierIndex} of {badge.tierCount}{#if badge.unlockedAt}
					&middot; reached {dateLabel(badge.unlockedAt)}{/if}
			</p>
		{:else}
			<p class="dialog-status">Not yet unlocked</p>
		{/if}
		<div class="badge-progress">
			<div class="badge-progress-track">
				<div class="badge-progress-fill" style="width: {progressPercent}%"></div>
			</div>
			<p class="badge-progress-label">{progressLabel}</p>
		</div>

		<ul class="tier-list">
			{#each badge.tiers as threshold, i (i)}
				{@const reached = badge.tierIndex > i}
				<li class="tier-row" class:reached class:current={badge.tierIndex === i + 1}>
					<span class="tier-num">Tier {i + 1}</span>
					<span class="tier-threshold">{threshold.toLocaleString()}</span>
					{#if reached}
						<svg
							class="tier-check"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="3"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-label="Reached"><path d="M20 6 9 17l-5-5" /></svg
						>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
</dialog>

<style>
	.badge-card {
		all: unset;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		width: 100%;
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem;
		cursor: pointer;
	}

	.badge-card:hover {
		border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
	}

	.badge-card:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.badge-card.unlocked {
		border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
	}

	.badge-card-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.badge-icon {
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 999px;
		background: var(--border);
		color: var(--ink-muted);
		flex-shrink: 0;
	}

	.badge-icon :global(svg) {
		width: 1.35rem;
		height: 1.35rem;
	}

	.badge-icon.unlocked {
		background: var(--accent);
		color: var(--accent-ink);
	}

	.tier-pill {
		font-size: 0.65rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.2rem 0.5rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--accent) 22%, transparent);
		color: var(--accent);
	}

	.badge-name {
		margin: 0.7rem 0 0.15rem;
		font-weight: 700;
		font-size: 0.9rem;
		color: var(--ink-primary);
	}

	.badge-desc {
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.35;
		color: var(--ink-muted);
	}

	.badge-progress {
		margin-top: auto;
		padding-top: 0.75rem;
	}

	.badge-progress-track {
		height: 0.4rem;
		border-radius: 999px;
		background: var(--border);
		overflow: hidden;
	}

	.badge-progress-fill {
		height: 100%;
		border-radius: 999px;
		background: var(--accent);
	}

	.badge-progress-label {
		margin: 0.4rem 0 0;
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--ink-secondary);
	}

	.badge-dialog {
		border: none;
		border-radius: var(--radius);
		padding: 0;
		background: var(--surface-raised);
		color: var(--ink-primary);
		max-width: 24rem;
		width: calc(100% - 2rem);
	}

	.badge-dialog::backdrop {
		background: rgba(0, 0, 0, 0.6);
	}

	.dialog-content {
		position: relative;
		padding: 1.5rem;
	}

	.dialog-close {
		position: absolute;
		top: 0.6rem;
		right: 0.6rem;
		background: none;
		border: none;
		font-size: 1.4rem;
		line-height: 1;
		color: var(--ink-muted);
		cursor: pointer;
		padding: 0.3rem;
	}

	.dialog-close:hover {
		color: var(--ink-primary);
	}

	.badge-icon.large {
		width: 3.25rem;
		height: 3.25rem;
	}

	.badge-icon.large :global(svg) {
		width: 1.6rem;
		height: 1.6rem;
	}

	.dialog-name {
		margin: 0.9rem 0 0.15rem;
		font-weight: 800;
		font-size: 1.1rem;
		color: var(--ink-primary);
	}

	.dialog-status {
		margin: 0.6rem 0 0;
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--accent);
	}

	.tier-list {
		list-style: none;
		margin: 1.1rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		max-height: 16rem;
		overflow-y: auto;
	}

	.tier-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.35rem 0.5rem;
		border-radius: var(--radius-sm);
		font-size: 0.8rem;
		color: var(--ink-muted);
	}

	.tier-row.reached {
		color: var(--ink-primary);
	}

	.tier-row.current {
		background: color-mix(in srgb, var(--accent) 14%, transparent);
		color: var(--accent);
		font-weight: 700;
	}

	.tier-num {
		flex-shrink: 0;
		width: 3.5rem;
	}

	.tier-threshold {
		flex: 1;
		font-variant-numeric: tabular-nums;
	}

	.tier-check {
		flex-shrink: 0;
		width: 0.9rem;
		height: 0.9rem;
		color: var(--accent);
	}
</style>
