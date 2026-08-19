<script lang="ts">
	import BadgeIcon from '$lib/components/BadgeIcon.svelte';
	import BadgeCard from '$lib/components/BadgeCard.svelte';

	let { data } = $props();

	const movieShowBadges = $derived(data.badges.filter((b) => b.category === 'movies_shows'));
	const musicBadges = $derived(data.badges.filter((b) => b.category === 'music'));

	function dateLabel(date: Date): string {
		return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
	}
</script>

<h1>Badges</h1>

<div class="card summary-card">
	<p class="summary-count">{data.unlockedCount} <span>/ {data.totalCount} badges unlocked</span></p>
</div>

{#if data.recentlyUnlocked.length > 0}
	<div class="card">
		<p class="card-title">Recently unlocked</p>
		<ul class="recent-list">
			{#each data.recentlyUnlocked as badge (badge.id)}
				<li class="recent-item">
					<span class="badge-icon unlocked">
						<BadgeIcon name={badge.icon} />
					</span>
					<span class="recent-text">
						<span class="recent-name">{badge.name}</span>
						{#if badge.unlockedAt}
							<span class="recent-date">Earned on {dateLabel(badge.unlockedAt)}</span>
						{/if}
					</span>
				</li>
			{/each}
		</ul>
	</div>
{/if}

<h2 class="section-headline">Movies &amp; Shows</h2>
<div class="badge-grid">
	{#each movieShowBadges as badge (badge.id)}
		<BadgeCard {badge} />
	{/each}
</div>

<h2 class="section-headline">Music</h2>
<div class="badge-grid">
	{#each musicBadges as badge (badge.id)}
		<BadgeCard {badge} />
	{/each}
</div>

<style>
	.card {
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.25rem;
		margin-top: 1.25rem;
	}

	.summary-card {
		margin-top: 1rem;
	}

	.summary-count {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 800;
		color: var(--ink-primary);
	}

	.summary-count span {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--ink-muted);
	}

	.card-title {
		margin: 0 0 0.75rem;
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--ink-primary);
	}

	.recent-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
	}

	.recent-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.6rem 0.75rem;
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

	.recent-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.recent-name {
		font-weight: 700;
		font-size: 0.9rem;
		color: var(--ink-primary);
	}

	.recent-date {
		font-size: 0.75rem;
		color: var(--ink-muted);
	}

	.badge-grid {
		margin-top: 0.75rem;
		display: grid;
		gap: 0.9rem;
		grid-template-columns: repeat(auto-fill, minmax(12.5rem, 1fr));
	}
</style>
