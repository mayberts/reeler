<script lang="ts">
	let { data } = $props();

	let hoveredIndex = $state<number | null>(null);

	const monthLabels = $derived(
		data.monthlyActivity.map((m) => {
			const [year, month] = m.month.split('-');
			return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(undefined, {
				month: 'short'
			});
		})
	);

	const maxCount = $derived(Math.max(1, ...data.monthlyActivity.map((m) => m.count)));
	const CHART_W = 384;
	const CHART_H = 190;
	const BASELINE_Y = 150;
	const BAR_AREA_H = 140;
	const SLOT_W = CHART_W / 12;
	const BAR_W = 24;

	const typeLabels: Record<string, string> = {
		movie: 'Movies',
		episode: 'Episodes',
		show: 'Shows',
		track: 'Tracks',
		album: 'Albums'
	};
</script>

<h1>Stats</h1>

<div class="tiles">
	<div class="tile">
		<span class="label">Total watches</span>
		<span class="value">{data.hero.totalWatches.toLocaleString()}</span>
	</div>
	<div class="tile">
		<span class="label">Unique titles</span>
		<span class="value">{data.hero.uniqueTitles.toLocaleString()}</span>
	</div>
	<div class="tile">
		<span class="label">Ratings given</span>
		<span class="value">{data.hero.totalRatings.toLocaleString()}</span>
	</div>
	<div class="tile">
		<span class="label">Average rating</span>
		<span class="value">{data.hero.avgRating ? data.hero.avgRating.toFixed(1) : '—'}</span>
	</div>
</div>

{#if data.byType.length > 0}
	<h2 class="section-headline">By type</h2>
	<ul class="by-type">
		{#each data.byType as row (row.type)}
			<li>
				<span class="type-label">{typeLabels[row.type] ?? row.type}</span>
				<span class="type-count">{row.count.toLocaleString()}</span>
			</li>
		{/each}
	</ul>
{/if}

<h2 class="section-headline">Activity, last 12 months</h2>
<svg
	viewBox="0 0 {CHART_W} {CHART_H}"
	class="chart"
	role="img"
	aria-label="Watches per month, last 12 months"
>
	{#each [0, 0.25, 0.5, 0.75, 1] as fraction (fraction)}
		<line
			x1="0"
			x2={CHART_W}
			y1={BASELINE_Y - fraction * BAR_AREA_H}
			y2={BASELINE_Y - fraction * BAR_AREA_H}
			class="gridline"
		/>
	{/each}
	{#each data.monthlyActivity as m, i (m.month)}
		{@const barHeight = (m.count / maxCount) * BAR_AREA_H}
		{@const x = i * SLOT_W + (SLOT_W - BAR_W) / 2}
		<rect
			{x}
			y={BASELINE_Y - barHeight}
			width={BAR_W}
			height={barHeight}
			rx="4"
			class="bar"
			class:hovered={hoveredIndex === i}
			role="presentation"
			onmouseenter={() => (hoveredIndex = i)}
			onmouseleave={() => (hoveredIndex = null)}
		/>
		<text x={x + BAR_W / 2} y={BASELINE_Y + 18} class="month-label" text-anchor="middle"
			>{monthLabels[i]}</text
		>
	{/each}
	<line x1="0" x2={CHART_W} y1={BASELINE_Y} y2={BASELINE_Y} class="baseline" />
</svg>
<p class="chart-value" aria-live="polite">
	{#if hoveredIndex !== null}
		{monthLabels[hoveredIndex]}: {data.monthlyActivity[hoveredIndex].count} watch{data
			.monthlyActivity[hoveredIndex].count === 1
			? ''
			: 'es'}
	{:else}
		Hover a bar for details
	{/if}
</p>

<div class="lists">
	<div>
		<h2 class="section-headline">Most watched</h2>
		{#if data.topWatched.length === 0}
			<p class="empty">Nothing yet.</p>
		{:else}
			<ol>
				{#each data.topWatched as row (row.mediaItemId)}
					<li>
						<span class="title">{row.title}{row.year ? ` (${row.year})` : ''}</span>
						<span class="count">×{row.watchCount}</span>
					</li>
				{/each}
			</ol>
		{/if}
	</div>
	<div>
		<h2 class="section-headline">Top rated</h2>
		{#if data.topRated.length === 0}
			<p class="empty">Nothing rated yet.</p>
		{:else}
			<ol>
				{#each data.topRated as row (row.mediaItemId)}
					<li>
						<span class="title">{row.title}{row.year ? ` (${row.year})` : ''}</span>
						<span class="count">{row.value}/10</span>
					</li>
				{/each}
			</ol>
		{/if}
	</div>
</div>

<style>
	.tiles {
		display: flex;
		flex-wrap: wrap;
		gap: 2rem;
		margin: 1.5rem 0 2rem;
	}
	.tile {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.tile .label {
		font-size: 0.85rem;
		opacity: 0.65;
	}
	.tile .value {
		font-size: 1.75rem;
		font-weight: 600;
	}

	.by-type {
		list-style: none;
		padding: 0;
		display: flex;
		gap: 1.5rem;
		margin: 0 0 2rem;
	}
	.by-type li {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.type-label {
		font-size: 0.8rem;
		opacity: 0.65;
	}
	.type-count {
		font-weight: 600;
	}

	.chart {
		width: 100%;
		max-width: 40rem;
		height: auto;
		display: block;
	}
	.gridline {
		stroke: light-dark(#e1e0d9, #2c2c2a);
		stroke-width: 1;
	}
	.baseline {
		stroke: light-dark(#c3c2b7, #383835);
		stroke-width: 1;
	}
	.bar {
		fill: light-dark(#2a78d6, #3987e5);
		transition: filter 0.1s ease;
	}
	.bar.hovered {
		filter: brightness(1.2);
	}
	.month-label {
		font-size: 8px;
		fill: light-dark(#898781, #898781);
	}
	.chart-value {
		font-size: 0.85rem;
		opacity: 0.7;
		min-height: 1.2em;
		margin: 0.5rem 0 2rem;
	}

	.lists {
		display: flex;
		flex-wrap: wrap;
		gap: 3rem;
	}
	.lists ol {
		list-style: none;
		padding: 0;
		margin: 0;
		min-width: 16rem;
	}
	.lists li {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.35rem 0;
		border-bottom: 1px solid light-dark(#eee, #2a2a2a);
	}
	.count {
		opacity: 0.7;
		white-space: nowrap;
	}
	.empty {
		opacity: 0.6;
	}
</style>
