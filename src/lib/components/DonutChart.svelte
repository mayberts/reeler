<script lang="ts">
	interface Segment {
		label: string;
		value: number;
		color: string;
	}

	interface Props {
		segments: Segment[];
		size?: number;
		strokeWidth?: number;
		formatValue?: (value: number) => string;
	}

	let {
		segments,
		size = 112,
		strokeWidth = 14,
		formatValue = (v) => v.toLocaleString()
	}: Props = $props();

	const total = $derived(segments.reduce((sum, s) => sum + s.value, 0));
	const r = $derived((size - strokeWidth) / 2);
	const circumference = $derived(2 * Math.PI * r);

	const arcs = $derived.by(() => {
		let cumulative = 0;
		return segments.map((s) => {
			const fraction = total > 0 ? s.value / total : 0;
			const dash = fraction * circumference;
			const arc = { ...s, dash, offset: -cumulative };
			cumulative += dash;
			return arc;
		});
	});
</script>

<div class="donut">
	<svg viewBox="0 0 {size} {size}" width={size} height={size} role="img" aria-label="Breakdown">
		<circle
			cx={size / 2}
			cy={size / 2}
			{r}
			fill="none"
			stroke="var(--border)"
			stroke-width={strokeWidth}
		/>
		{#each arcs as arc (arc.label)}
			{#if arc.dash > 0}
				<circle
					cx={size / 2}
					cy={size / 2}
					{r}
					fill="none"
					stroke={arc.color}
					stroke-width={strokeWidth}
					stroke-dasharray="{arc.dash} {circumference - arc.dash}"
					stroke-dashoffset={arc.offset}
					stroke-linecap={segments.length > 1 ? 'butt' : 'round'}
					transform="rotate(-90 {size / 2} {size / 2})"
				/>
			{/if}
		{/each}
	</svg>
	<ul class="legend">
		{#each segments as s (s.label)}
			<li>
				<span class="dot" style="background: {s.color}"></span>
				<span class="label">{s.label}</span>
				<span class="value">{formatValue(s.value)}</span>
			</li>
		{/each}
	</ul>
</div>

<style>
	.donut {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
	}
	.legend {
		list-style: none;
		margin: 0;
		padding: 0;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.legend li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
	}
	.dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 999px;
		flex-shrink: 0;
	}
	.label {
		color: var(--ink-secondary);
	}
	.value {
		margin-left: auto;
		font-weight: 700;
		color: var(--ink-primary);
	}
</style>
