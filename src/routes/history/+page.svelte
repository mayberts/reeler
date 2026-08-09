<script lang="ts">
	let { data } = $props();
</script>

<h1>Watch history</h1>

{#if data.history.length === 0}
	<p>Nothing watched yet — run a sync from the dashboard, or watch something in Plex.</p>
{:else}
	<ul class="history">
		{#each data.history as entry (entry.id)}
			<li>
				<span class="title"
					>{entry.mediaItem.title}{entry.mediaItem.year ? ` (${entry.mediaItem.year})` : ''}</span
				>
				<span class="meta">
					<span class="source">{entry.source}</span>
					<span class="date">{entry.watchedAt.toLocaleString()}</span>
				</span>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.history {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.history li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid light-dark(#eee, #2a2a2a);
	}
	.meta {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		font-size: 0.85rem;
		opacity: 0.7;
	}
	.source {
		text-transform: uppercase;
		font-size: 0.7rem;
		letter-spacing: 0.03em;
		border: 1px solid currentColor;
		border-radius: 0.25rem;
		padding: 0.05rem 0.35rem;
	}
</style>
