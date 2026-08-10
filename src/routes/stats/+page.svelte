<script lang="ts">
	import StackedBarChart from '$lib/components/StackedBarChart.svelte';
	import SimpleBarChart from '$lib/components/SimpleBarChart.svelte';
	import DonutChart from '$lib/components/DonutChart.svelte';

	let { data } = $props();

	const COLOR_MOVIE = 'light-dark(#2a78d6, #3987e5)';
	const COLOR_SHOW = 'light-dark(#7c3aed, #9563f5)';
	const COLOR_MUSIC = 'light-dark(#0d9488, #14b8a6)';
	const COLOR_NEUTRAL = 'light-dark(#c3c2b7, #3f3f46)';
	const COLOR_ACCENT = 'light-dark(#e5a00d, #e5a00d)';
	const COLOR_SUCCESS = 'light-dark(#15803d, #4ade80)';

	const typeLabels: Record<string, string> = {
		movie: 'Movie',
		episode: 'Episode',
		show: 'Show',
		track: 'Track',
		album: 'Album'
	};

	function formatDuration(minutes: number): string {
		if (minutes <= 0) return '0m';
		if (minutes >= 1440) return `${(minutes / 1440).toFixed(1)}d`;
		if (minutes >= 60) {
			const h = Math.floor(minutes / 60);
			const m = Math.round(minutes % 60);
			return m > 0 ? `${h}h ${m}m` : `${h}h`;
		}
		return `${Math.round(minutes)}m`;
	}

	function formatRating(avg: number | null): string {
		return avg !== null ? avg.toFixed(1) : '—';
	}

	const monthLabels = $derived(
		data.monthlyActivity.map((m) => {
			const [year, month] = m.month.split('-');
			return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(undefined, {
				month: 'short'
			});
		})
	);

	const activitySeries = $derived([
		{
			key: 'movie',
			label: 'Movies',
			color: COLOR_MOVIE,
			values: data.monthlyActivity.map((m) => m.counts.movie)
		},
		{
			key: 'episode',
			label: 'Episodes',
			color: COLOR_SHOW,
			values: data.monthlyActivity.map((m) => m.counts.episode)
		},
		{
			key: 'track',
			label: 'Tracks',
			color: COLOR_MUSIC,
			values: data.monthlyActivity.map((m) => m.counts.track)
		}
	]);

	const timeSeries = $derived([
		{
			key: 'movie',
			label: 'Movies',
			color: COLOR_MOVIE,
			values: data.monthlyActivity.map((m) => m.minutes.movie)
		},
		{
			key: 'episode',
			label: 'Episodes',
			color: COLOR_SHOW,
			values: data.monthlyActivity.map((m) => m.minutes.episode)
		},
		{
			key: 'track',
			label: 'Tracks',
			color: COLOR_MUSIC,
			values: data.monthlyActivity.map((m) => m.minutes.track)
		}
	]);

	const genreColumns = $derived([
		{ label: 'Movies', color: COLOR_MOVIE, items: data.genres.movies },
		{ label: 'Shows', color: COLOR_SHOW, items: data.genres.shows },
		{ label: 'Music', color: COLOR_MUSIC, items: data.genres.music }
	]);

	const ratingDistLabels = $derived(data.ratingDistribution.map((r) => `${r.value}★`));
	const ratingDistValues = $derived(data.ratingDistribution.map((r) => r.count));

	const weekdayLabels = $derived(data.weekdayActivity.map((w) => w.label));
	const weekdayValues = $derived(data.weekdayActivity.map((w) => Number(w.average.toFixed(1))));
	const maxWeekdayIndex = $derived(
		data.weekdayActivity.reduce((maxI, w, i, arr) => (w.average > arr[maxI].average ? i : maxI), 0)
	);

	const collectionMix = $derived([
		{ label: 'Movies', value: data.collection.movies, color: COLOR_MOVIE },
		{ label: 'Shows', value: data.collection.shows, color: COLOR_SHOW },
		{ label: 'Albums', value: data.collection.albums, color: COLOR_MUSIC }
	]);

	function progressDonut(
		completed: number,
		total: number,
		completedLabel = 'Watched',
		remainingLabel = 'Unwatched'
	) {
		return [
			{ label: completedLabel, value: completed, color: COLOR_SUCCESS },
			{ label: remainingLabel, value: Math.max(0, total - completed), color: COLOR_NEUTRAL }
		];
	}
</script>

<h1>Statistics</h1>

<div class="tiles">
	<div class="tile">
		<span class="value">{data.hero.moviesWatched.toLocaleString()}</span>
		<span class="label">Movies watched</span>
	</div>
	<div class="tile">
		<span class="value">{data.hero.showsWatched.toLocaleString()}</span>
		<span class="label">Shows watched</span>
	</div>
	<div class="tile">
		<span class="value">{data.hero.episodesWatched.toLocaleString()}</span>
		<span class="label">Episodes watched</span>
	</div>
	<div class="tile">
		<span class="value">{data.hero.tracksPlayed.toLocaleString()}</span>
		<span class="label">Tracks played</span>
	</div>
	<div class="tile">
		<span class="value">{formatDuration(data.hero.watchMinutes)}</span>
		<span class="label">Watch time</span>
	</div>
	<div class="tile">
		<span class="value">{formatDuration(data.hero.listeningMinutes)}</span>
		<span class="label">Listening time</span>
	</div>
</div>

<h2 class="section-headline">Watching</h2>

<div class="card">
	<h3 class="card-title">Activity over time</h3>
	<StackedBarChart
		months={monthLabels}
		series={activitySeries}
		ariaLabel="Plays per month, last 12 months, by type"
	/>
</div>

<div class="card">
	<h3 class="card-title">Watch &amp; listen time over time</h3>
	<StackedBarChart
		months={monthLabels}
		series={timeSeries}
		ariaLabel="Time spent per month, last 12 months, by type"
		formatValue={formatDuration}
	/>
</div>

<div class="card">
	<h3 class="card-title">Most watched/listened genres</h3>
	<div class="genre-grid">
		{#each genreColumns as col (col.label)}
			{@const max = Math.max(1, ...col.items.map((g) => g.count))}
			<div class="genre-col">
				<h4 class="genre-col-title">{col.label}</h4>
				{#if col.items.length === 0}
					<p class="empty">No genre data yet.</p>
				{:else}
					<ul class="genre-list">
						{#each col.items as g (g.genre)}
							<li>
								<div class="genre-bar-row">
									<span class="genre-name">{g.genre}</span>
									<span class="genre-count">{g.count.toLocaleString()}</span>
								</div>
								<div class="genre-bar-track">
									<div
										class="genre-bar-fill"
										style="width: {(g.count / max) * 100}%; background: {col.color}"
									></div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/each}
	</div>
</div>

<div class="card-row">
	<div class="card">
		<h3 class="card-title">Time spent</h3>
		<dl class="stat-rows">
			<div>
				<dt>Movies</dt>
				<dd>{formatDuration(data.watchTimeByType.movies)}</dd>
			</div>
			<div>
				<dt>Shows</dt>
				<dd>{formatDuration(data.watchTimeByType.shows)}</dd>
			</div>
			<div>
				<dt>Music</dt>
				<dd>{formatDuration(data.watchTimeByType.music)}</dd>
			</div>
		</dl>
	</div>
	<div class="card">
		<h3 class="card-title">Average ratings</h3>
		<dl class="stat-rows">
			<div>
				<dt>Movies</dt>
				<dd>
					{#if data.ratings.movies.avgRating !== null}★ {formatRating(
							data.ratings.movies.avgRating
						)}{:else}No ratings{/if}
				</dd>
			</div>
			<div>
				<dt>Shows</dt>
				<dd>
					{#if data.ratings.shows.avgRating !== null}★ {formatRating(
							data.ratings.shows.avgRating
						)}{:else}No ratings{/if}
				</dd>
			</div>
			<div>
				<dt>Music</dt>
				<dd>
					{#if data.ratings.music.avgRating !== null}★ {formatRating(
							data.ratings.music.avgRating
						)}{:else}No ratings{/if}
				</dd>
			</div>
		</dl>
	</div>
</div>

<div class="card">
	<h3 class="card-title">Rating distribution</h3>
	<SimpleBarChart
		labels={ratingDistLabels}
		values={ratingDistValues}
		ariaLabel="Number of ratings given, by star value"
		color={COLOR_ACCENT}
	/>
</div>

<div class="card">
	<h3 class="card-title">Average activity by day of week</h3>
	<SimpleBarChart
		labels={weekdayLabels}
		values={weekdayValues}
		ariaLabel="Average plays per weekday, last 12 months"
		formatLabel={(v) => v.toFixed(1)}
		colorFor={(i) => (i === maxWeekdayIndex ? COLOR_MOVIE : COLOR_NEUTRAL)}
	/>
</div>

<h2 class="section-headline">Collection</h2>

<div class="card-row">
	<div class="card">
		<h3 class="card-title">Breakdown</h3>
		<ul class="breakdown-list">
			<li>
				<span>Movies collected</span><strong>{data.collection.movies.toLocaleString()}</strong>
			</li>
			<li><span>Shows collected</span><strong>{data.collection.shows.toLocaleString()}</strong></li>
			<li>
				<span>Episodes collected</span><strong>{data.collection.episodes.toLocaleString()}</strong>
			</li>
			<li>
				<span>Albums collected</span><strong>{data.collection.albums.toLocaleString()}</strong>
			</li>
		</ul>
	</div>
	<div class="card">
		<h3 class="card-title">Watched vs unwatched</h3>
		<div class="donut-grid">
			<div>
				<h4 class="donut-title">Collection mix</h4>
				<DonutChart segments={collectionMix} />
			</div>
			<div>
				<h4 class="donut-title">Movies watched</h4>
				<DonutChart
					segments={progressDonut(
						data.watchedVsUnwatched.movies.watched,
						data.watchedVsUnwatched.movies.total
					)}
				/>
			</div>
			<div>
				<h4 class="donut-title">Shows watched</h4>
				<DonutChart
					segments={progressDonut(
						data.watchedVsUnwatched.shows.watched,
						data.watchedVsUnwatched.shows.total
					)}
				/>
			</div>
			<div>
				<h4 class="donut-title">Albums listened</h4>
				<DonutChart
					segments={progressDonut(
						data.watchedVsUnwatched.albums.watched,
						data.watchedVsUnwatched.albums.total,
						'Listened',
						'Not listened'
					)}
				/>
			</div>
		</div>
	</div>
</div>

<div class="lists">
	<div>
		<h2 class="section-headline">Most watched</h2>
		{#if data.topWatched.length === 0}
			<p class="empty">Nothing yet.</p>
		{:else}
			<ol>
				{#each data.topWatched as row (row.mediaItemId)}
					<li>
						<span class="title"
							>{row.title}{row.year ? ` (${row.year})` : ''}
							<span class="type-tag">{typeLabels[row.type] ?? row.type}</span></span
						>
						<span class="count">×{row.watchCount}</span>
					</li>
				{/each}
			</ol>
		{/if}
	</div>
	<div>
		<h2 class="section-headline">Most listened</h2>
		{#if data.topListened.length === 0}
			<p class="empty">Nothing yet.</p>
		{:else}
			<ol>
				{#each data.topListened as row (row.mediaItemId)}
					<li>
						<span class="title"
							>{row.title}{row.year ? ` (${row.year})` : ''}
							<span class="type-tag">{typeLabels[row.type] ?? row.type}</span></span
						>
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
						<span class="title"
							>{row.title}{row.year ? ` (${row.year})` : ''}
							<span class="type-tag">{typeLabels[row.type] ?? row.type}</span></span
						>
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
		gap: 1rem;
		margin: 1.5rem 0 2rem;
	}
	.tile {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 9rem;
		flex: 1 1 9rem;
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.1rem 1.3rem;
	}
	.tile .value {
		font-size: 1.75rem;
		font-weight: 700;
	}
	.tile .label {
		font-size: 0.8rem;
		color: var(--ink-muted);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.card {
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.5rem;
		margin-bottom: 1.5rem;
	}
	.card-row {
		display: flex;
		flex-wrap: wrap;
		gap: 1.5rem;
	}
	.card-row .card {
		flex: 1 1 18rem;
	}
	.card-title {
		margin: 0 0 1.1rem;
		font-size: 0.78rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--ink-muted);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.card-title::before {
		content: '';
		display: block;
		width: 0.2rem;
		height: 0.9rem;
		border-radius: 999px;
		background: var(--accent);
		flex-shrink: 0;
	}

	.genre-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 2rem;
	}
	.genre-col-title {
		margin: 0 0 0.75rem;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--ink-muted);
	}
	.genre-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.genre-bar-row {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.85rem;
		margin-bottom: 0.25rem;
	}
	.genre-name {
		font-weight: 600;
	}
	.genre-count {
		color: var(--ink-muted);
		font-weight: 700;
	}
	.genre-bar-track {
		height: 0.4rem;
		border-radius: 999px;
		background: var(--border);
		overflow: hidden;
	}
	.genre-bar-fill {
		height: 100%;
		border-radius: 999px;
	}

	.stat-rows {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin: 0;
	}
	.stat-rows div {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.7rem 0.9rem;
		background: var(--surface);
		border-radius: var(--radius-sm);
	}
	.stat-rows dt {
		font-weight: 600;
		color: var(--ink-secondary);
	}
	.stat-rows dd {
		margin: 0;
		font-weight: 700;
	}

	.breakdown-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.breakdown-list li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.7rem 0.9rem;
		background: var(--surface);
		border-radius: var(--radius-sm);
	}
	.breakdown-list span {
		color: var(--ink-secondary);
		font-weight: 600;
	}

	.donut-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: 1.5rem;
	}
	.donut-title {
		margin: 0 0 0.75rem;
		text-align: center;
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--ink-muted);
	}

	.lists {
		display: flex;
		flex-wrap: wrap;
		gap: 3rem;
		margin-top: 1rem;
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
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--border);
	}
	.title {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.type-tag {
		font-size: 0.6rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.1rem 0.4rem;
		border-radius: 999px;
		background: var(--border);
		color: var(--ink-muted);
	}
	.count {
		color: var(--ink-muted);
		font-weight: 600;
		white-space: nowrap;
	}
	.empty {
		color: var(--ink-muted);
	}
</style>
