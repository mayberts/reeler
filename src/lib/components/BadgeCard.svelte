<script lang="ts">
	import BadgeIcon from '$lib/components/BadgeIcon.svelte';
	import type { BadgeProgress } from '$lib/server/badges/compute';

	let { badge }: { badge: BadgeProgress } = $props();

	const progressLabel = $derived(
		badge.nextTarget === null
			? `${badge.currentValue} — maxed out`
			: `${badge.currentValue} / ${badge.nextTarget}`
	);

	const progressPercent = $derived(
		badge.nextTarget === null ? 100 : Math.min(100, (badge.currentValue / badge.nextTarget) * 100)
	);
</script>

<div class="badge-card" class:unlocked={badge.tierIndex > 0}>
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
</div>

<style>
	.badge-card {
		display: flex;
		flex-direction: column;
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem;
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
</style>
