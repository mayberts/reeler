<script lang="ts">
	interface Props {
		labels: string[];
		values: number[];
		ariaLabel: string;
		formatLabel?: (value: number) => string;
		/** Uniform bar color, overridden per-bar by `colorFor` when given. */
		color?: string;
		colorFor?: (index: number) => string;
	}

	let {
		labels,
		values,
		ariaLabel,
		formatLabel = (v) => v.toLocaleString(),
		color = 'light-dark(#e5a00d, #e5a00d)',
		colorFor
	}: Props = $props();

	const maxValue = $derived(Math.max(1, ...values));
	const CHART_W = 480;
	const CHART_H = 170;
	const BASELINE_Y = 130;
	const BAR_AREA_H = 95;
	const SLOT_W = $derived(CHART_W / Math.max(1, labels.length));
	const BAR_W = $derived(Math.min(36, SLOT_W * 0.6));
</script>

<svg viewBox="0 0 {CHART_W} {CHART_H}" class="chart" role="img" aria-label={ariaLabel}>
	{#each labels as label, i (i)}
		{@const x = i * SLOT_W + (SLOT_W - BAR_W) / 2}
		{@const height = (values[i] / maxValue) * BAR_AREA_H}
		{@const y = BASELINE_Y - height}
		<rect
			{x}
			{y}
			width={BAR_W}
			{height}
			rx="3"
			class="bar"
			style="fill: {colorFor ? colorFor(i) : color}"
		/>
		{#if values[i] > 0}
			<text x={x + BAR_W / 2} y={y - 6} class="value-label" text-anchor="middle"
				>{formatLabel(values[i])}</text
			>
		{/if}
		<text x={x + BAR_W / 2} y={BASELINE_Y + 18} class="axis-label" text-anchor="middle"
			>{label}</text
		>
	{/each}
	<line x1="0" x2={CHART_W} y1={BASELINE_Y} y2={BASELINE_Y} class="baseline" />
</svg>

<style>
	.chart {
		width: 100%;
		height: auto;
		display: block;
	}
	.bar {
		transition: filter 0.1s ease;
	}
	.baseline {
		stroke: light-dark(#c3c2b7, #383835);
		stroke-width: 1;
	}
	.value-label {
		font-size: 9px;
		font-weight: 700;
		fill: var(--ink-secondary);
	}
	.axis-label {
		font-size: 8px;
		fill: light-dark(#898781, #898781);
	}
</style>
