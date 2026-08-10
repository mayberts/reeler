<script lang="ts">
	interface Series {
		key: string;
		label: string;
		color: string;
		values: number[];
	}

	interface Props {
		months: string[];
		series: Series[];
		ariaLabel: string;
		/** Formats a single series/total value for the hover readout, e.g. "12h 30m" or "1,204". */
		formatValue?: (value: number) => string;
	}

	let { months, series, ariaLabel, formatValue = (v) => v.toLocaleString() }: Props = $props();

	let hoveredIndex = $state<number | null>(null);

	const totals = $derived(months.map((_, i) => series.reduce((sum, s) => sum + s.values[i], 0)));
	const maxTotal = $derived(Math.max(1, ...totals));

	const CHART_W = 480;
	const CHART_H = 190;
	const BASELINE_Y = 150;
	const BAR_AREA_H = 140;
	const BAR_W = 20;
	const SLOT_W = $derived(CHART_W / Math.max(1, months.length));
</script>

<svg viewBox="0 0 {CHART_W} {CHART_H}" class="chart" role="img" aria-label={ariaLabel}>
	{#each [0, 0.25, 0.5, 0.75, 1] as fraction (fraction)}
		<line
			x1="0"
			x2={CHART_W}
			y1={BASELINE_Y - fraction * BAR_AREA_H}
			y2={BASELINE_Y - fraction * BAR_AREA_H}
			class="gridline"
		/>
	{/each}
	{#each months as month, i (i)}
		{@const x = i * SLOT_W + (SLOT_W - BAR_W) / 2}
		<g
			role="presentation"
			onmouseenter={() => (hoveredIndex = i)}
			onmouseleave={() => (hoveredIndex = null)}
		>
			<rect {x} y={BASELINE_Y - BAR_AREA_H} width={BAR_W} height={BAR_AREA_H} class="hit-area" />
			{#each series as s, si (s.key)}
				{@const before = series.slice(0, si).reduce((sum, ss) => sum + ss.values[i], 0)}
				{@const height = (s.values[i] / maxTotal) * BAR_AREA_H}
				{@const y = BASELINE_Y - (before / maxTotal) * BAR_AREA_H - height}
				{#if s.values[i] > 0}
					<rect
						{x}
						{y}
						width={BAR_W}
						{height}
						rx="2"
						class="segment"
						class:hovered={hoveredIndex === i}
						style="fill: {s.color}"
					/>
				{/if}
			{/each}
		</g>
		<text x={x + BAR_W / 2} y={BASELINE_Y + 18} class="month-label" text-anchor="middle"
			>{month}</text
		>
	{/each}
	<line x1="0" x2={CHART_W} y1={BASELINE_Y} y2={BASELINE_Y} class="baseline" />
</svg>

<p class="chart-value" aria-live="polite">
	{#if hoveredIndex !== null}
		{months[hoveredIndex]}: {formatValue(totals[hoveredIndex])} total{#each series as s (s.key)}{#if s.values[hoveredIndex] > 0}
				&nbsp;· {s.label} {formatValue(s.values[hoveredIndex])}{/if}{/each}
	{:else}
		Hover a bar for details
	{/if}
</p>

<div class="legend">
	{#each series as s (s.key)}
		<span class="legend-item"><span class="dot" style="background: {s.color}"></span>{s.label}</span
		>
	{/each}
</div>

<style>
	.chart {
		width: 100%;
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
	.hit-area {
		fill: transparent;
	}
	.segment {
		transition: filter 0.1s ease;
	}
	.segment.hovered {
		filter: brightness(1.2);
	}
	.month-label {
		font-size: 8px;
		fill: light-dark(#898781, #898781);
	}
	.chart-value {
		font-size: 0.85rem;
		color: var(--ink-muted);
		min-height: 1.2em;
		margin: 0.5rem 0 0;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 1.1rem;
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--border);
	}
	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--ink-secondary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.dot {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 999px;
		flex-shrink: 0;
	}
</style>
