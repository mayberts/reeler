<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import EpisodeRow from '$lib/components/EpisodeRow.svelte';

	let { data, form } = $props();

	const item = $derived(data.item);
	const isMusic = $derived(item.type === 'track' || item.type === 'album');
	// Plex scrobbles land on the track, not the album, so an album's own watch_history
	// rows only ever come from a manual click here — not a real "have I heard this album"
	// signal like it is for movies/shows/tracks. Hide the pill rather than show fake data.
	const showWatched = $derived(item.type !== 'album');
	const isShow = $derived(item.type === 'show');
	const isSeason = $derived(item.type === 'season');

	const posterSrc = $derived(
		item.plexThumb || item.artworkUrl ? `/api/media/${item.id}/poster` : null
	);
	const backdropSrc = $derived(
		item.plexArt || item.backdropUrl ? `/api/media/${item.id}/backdrop` : null
	);
	const parentHref = $derived(data.parent ? resolve('/media/[id]', { id: data.parent.id }) : null);

	const genres = $derived.by(() => {
		if (!item.genres) return [] as string[];
		try {
			const parsed = JSON.parse(item.genres);
			return Array.isArray(parsed) ? (parsed as string[]) : [];
		} catch {
			return [];
		}
	});

	function formatRuntime(minutes: number | null) {
		if (!minutes) return null;
		if (minutes < 60) return `${minutes} min`;
		const hours = Math.floor(minutes / 60);
		const rest = minutes % 60;
		return rest ? `${hours}h ${rest}m` : `${hours}h`;
	}

	const runtime = $derived(formatRuntime(item.runtimeMinutes));

	// Links out to the source-of-truth pages for each external id Reeler has stored —
	// not a data fetch, just a well-known URL shape per provider.
	const externalLinks = $derived.by(() => {
		const links: { label: string; url: string }[] = [];
		if (item.imdbId)
			links.push({ label: 'IMDb', url: `https://www.imdb.com/title/${item.imdbId}` });
		if (item.tmdbId) {
			const kind = item.type === 'movie' ? 'movie' : 'tv';
			links.push({ label: 'TMDb', url: `https://www.themoviedb.org/${kind}/${item.tmdbId}` });
		}
		if (item.tvdbId) {
			const kind = item.type === 'movie' ? 'movie' : 'series';
			links.push({
				label: 'TVDB',
				url: `https://www.thetvdb.com/dereferrer/${kind}/${item.tvdbId}`
			});
		}
		return links;
	});
</script>

<div class="hero" class:has-backdrop={!!backdropSrc}>
	{#if backdropSrc}
		<img class="backdrop" src={backdropSrc} alt="" />
		<div class="scrim"></div>
	{/if}
	<div class="hero-inner">
		{#if parentHref && data.parent}
			<a class="breadcrumb" href={parentHref}>&larr; {data.parent.title}</a>
		{/if}
		<div class="hero-body">
			<div class="poster">
				{#if posterSrc}
					<img src={posterSrc} alt="" />
				{:else}
					<div class="placeholder" aria-hidden="true">{item.title.charAt(0).toUpperCase()}</div>
				{/if}
			</div>
			<div class="hero-text">
				<h1>{item.title}</h1>
				{#if isMusic && data.parent}
					<p class="subtitle">from {data.parent.title}</p>
				{:else if item.tagline}
					<p class="subtitle tagline">"{item.tagline}"</p>
				{/if}

				<div class="meta-row">
					{#if item.artist}<span class="badge">{item.artist}</span>{/if}
					{#if item.year}<span class="badge">{item.year}</span>{/if}
					{#if runtime}<span class="badge">{runtime}</span>{/if}
					{#if isShow && data.seasons.length > 0}
						<span class="badge"
							>{data.seasons.length} Season{data.seasons.length === 1 ? '' : 's'}</span
						>
					{/if}
					{#if item.criticRating !== null}
						<span class="badge rating-badge">★ {item.criticRating.toFixed(1)}</span>
					{/if}
					{#if item.contentRating}<span class="badge">{item.contentRating}</span>{/if}
					{#if item.studio}<span class="badge">{item.studio}</span>{/if}
					{#if data.myRating !== null}<span class="badge rating">★ {data.myRating}/10</span>{/if}
				</div>

				{#if externalLinks.length > 0}
					<div class="external-links">
						{#each externalLinks as link (link.label)}
							<a
								class="ext-badge"
								href={link.url}
								target="_blank"
								rel="external noopener noreferrer">{link.label}</a
							>
						{/each}
					</div>
				{/if}

				<div class="action-bar">
					{#if showWatched}
						<form method="POST" action="?/markWatched" use:enhance>
							<button type="submit" class="pill watched" class:active={data.watchCount > 0}>
								<svg
									class="icon"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle
										cx="12"
										cy="12"
										r="3"
										fill={data.watchCount > 0 ? 'currentColor' : 'none'}
									/></svg
								>
								Watched{data.watchCount > 0 ? ` · ${data.watchCount}` : ''}
							</button>
						</form>
					{/if}

					<form
						method="POST"
						action="?/rate"
						use:enhance
						class="pill rate-pill"
						class:active={data.myRating !== null}
					>
						<svg
							class="icon"
							viewBox="0 0 24 24"
							fill={data.myRating !== null ? 'currentColor' : 'none'}
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							><polygon
								points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
							/></svg
						>
						<input
							type="number"
							name="value"
							min="0"
							max="10"
							step="1"
							value={data.myRating ?? ''}
							placeholder="Rate"
						/>
						<button type="submit">Save</button>
					</form>

					{#if data.myLists.length > 0}
						<form method="POST" action="?/addToList" use:enhance class="pill list-pill">
							<svg
								class="icon"
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
							<select name="listId">
								{#each data.myLists as list (list.id)}
									<option value={list.id}>{list.name}</option>
								{/each}
							</select>
							<button type="submit">Add</button>
						</form>
					{/if}
				</div>

				{#if form?.message}
					<p class="error">{form.message}</p>
				{/if}
				{#if showWatched && data.lastWatchedAt}
					<p class="last-watched">Last watched {data.lastWatchedAt.toLocaleDateString()}</p>
				{/if}
			</div>
		</div>
	</div>
</div>

{#if item.summary}
	<h2 class="section-headline">Overview</h2>
	<p class="summary">{item.summary}</p>
{/if}

{#if genres.length > 0}
	<div class="genres">
		{#each genres as genre (genre)}
			<span class="badge">{genre}</span>
		{/each}
	</div>
{/if}

{#if data.credits && data.credits.cast.length > 0}
	<h2 class="section-headline">Top Cast</h2>
	<div class="cast-grid">
		{#each data.credits.cast as credit (credit.person.id)}
			<a class="person-card" href={resolve('/people/[id]', { id: credit.person.id })}>
				<div class="person-photo">
					{#if credit.person.profileUrl}
						<img src={credit.person.profileUrl} alt="" loading="lazy" />
					{:else}
						<div class="placeholder small" aria-hidden="true">
							{credit.person.name.charAt(0).toUpperCase()}
						</div>
					{/if}
				</div>
				<strong>{credit.person.name}</strong>
				{#if credit.character}<span>{credit.character}</span>{/if}
			</a>
		{/each}
	</div>
{/if}

{#if data.credits && data.credits.crew.length > 0}
	<h2 class="section-headline">Crew</h2>
	<div class="cast-grid">
		{#each data.credits.crew as credit (credit.person.id + (credit.job ?? ''))}
			<a class="person-card" href={resolve('/people/[id]', { id: credit.person.id })}>
				<div class="person-photo">
					{#if credit.person.profileUrl}
						<img src={credit.person.profileUrl} alt="" loading="lazy" />
					{:else}
						<div class="placeholder small" aria-hidden="true">
							{credit.person.name.charAt(0).toUpperCase()}
						</div>
					{/if}
				</div>
				<strong>{credit.person.name}</strong>
				{#if credit.job}<span>{credit.job}</span>{/if}
			</a>
		{/each}
	</div>
{/if}

{#if isShow && data.seasons.length > 0}
	<h2 class="section-headline">Seasons</h2>
	<div class="seasons-grid">
		{#each data.seasons as season (season.id)}
			<a class="season-card" href={resolve('/media/[id]', { id: season.id })}>
				<div class="season-poster">
					{#if season.plexThumb || season.artworkUrl}
						<img src={`/api/media/${season.id}/poster`} alt="" loading="lazy" />
					{:else}
						<div class="placeholder small" aria-hidden="true">
							{season.title.charAt(0).toUpperCase()}
						</div>
					{/if}
				</div>
				<div class="season-info">
					<strong>{season.title}</strong>
					{#if season.episodeCount}
						<span>{season.episodeCount} episode{season.episodeCount === 1 ? '' : 's'}</span>
					{/if}
				</div>
			</a>
		{/each}
	</div>
{/if}

{#if isSeason && data.episodes.length > 0}
	<h2 class="section-headline">Episodes</h2>
	<div class="episodes-list">
		{#each data.episodes as episode (episode.id)}
			<EpisodeRow
				id={episode.id}
				title={episode.title}
				episodeNumber={episode.episodeNumber}
				summary={episode.summary}
				airDate={episode.airDate}
				runtimeMinutes={episode.runtimeMinutes}
				criticRating={episode.criticRating}
				hasArtwork={!!(episode.plexThumb || episode.artworkUrl)}
				watched={data.watchedEpisodeIds.includes(episode.id)}
				myLists={data.myLists}
			/>
		{/each}
	</div>
{/if}

<style>
	.hero {
		position: relative;
		margin: 0 -1.5rem 2rem;
		padding: 2rem 1.5rem;
	}
	.hero.has-backdrop {
		padding-top: 3.5rem;
		padding-bottom: 3rem;
	}
	.backdrop {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		z-index: 0;
	}
	.scrim {
		position: absolute;
		inset: 0;
		/* Two layers: a horizontal fade (opaque behind the poster/text column on the
		   left, fading out toward the right so the backdrop still shows through there)
		   plus a vertical fade that only blends the very top/bottom edges into the page
		   background — it holds a flat, solid plateau across the middle (where the
		   title/meta-row/action-bar all actually sit) rather than dipping back toward
		   transparent there, since a dip at exactly that height was defeating the
		   horizontal layer's contrast on bright/detailed backdrop images.
		   `light-dark()` per stop, not a `[data-theme]` selector — this app has no such
		   attribute, it themes entirely off `prefers-color-scheme` via `light-dark()`
		   (see app.css). A `:root:not([data-theme='dark'])` override here would always
		   match (the attribute never exists) and permanently force the light variant
		   regardless of actual color scheme — which is exactly what was washing out
		   dark backdrop images in dark mode. */
		background:
			linear-gradient(
				90deg,
				light-dark(rgba(255, 255, 255, 0.9), rgba(0, 0, 0, 0.88)) 0%,
				light-dark(rgba(255, 255, 255, 0.9), rgba(0, 0, 0, 0.88)) 42%,
				light-dark(rgba(255, 255, 255, 0.4), rgba(0, 0, 0, 0.35)) 68%,
				transparent 90%
			),
			linear-gradient(
				180deg,
				var(--surface) 0%,
				light-dark(rgba(255, 255, 255, 0.5), rgba(0, 0, 0, 0.55)) 14%,
				light-dark(rgba(255, 255, 255, 0.5), rgba(0, 0, 0, 0.55)) 86%,
				var(--surface) 100%
			);
		z-index: 1;
	}
	.hero-inner {
		position: relative;
		z-index: 2;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.breadcrumb {
		color: var(--ink-secondary);
		font-size: 0.85rem;
		font-weight: 600;
		text-decoration: none;
	}
	.breadcrumb:hover {
		color: var(--accent);
	}
	.hero-body {
		display: flex;
		gap: 1.5rem;
	}
	.poster {
		flex: 0 0 10.5rem;
		aspect-ratio: 2 / 3;
		border-radius: var(--radius);
		overflow: hidden;
		background: light-dark(#e5e4df, #232322);
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
	}
	.poster img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 3rem;
		font-weight: 600;
		opacity: 0.35;
	}
	.hero-text {
		/* Bounded, not flex:1 — letting this stretch to fill the entire remaining hero
		   width (previous bug) meant a translucent background placed on it covered
		   almost the whole backdrop image instead of just the text, looking like a
		   giant grey box rather than a full-bleed hero. Capping the width keeps the
		   backdrop image dominant on the right, matching the reference look, and keeps
		   the scrim's opaque zone (above) sized to actually match where text sits. */
		flex: 0 1 auto;
		max-width: 34rem;
		min-width: 0;
	}
	.hero-text h1 {
		margin-bottom: 0.35rem;
		/* Belt-and-suspenders alongside the scrim — a bright/detailed patch of the
		   backdrop image directly behind the title shouldn't be able to wash it out. */
		text-shadow: 0 2px 12px rgba(0, 0, 0, 0.7);
	}
	.subtitle {
		color: var(--ink-secondary);
		margin: 0 0 0.75rem;
		text-shadow: 0 1px 8px rgba(0, 0, 0, 0.6);
	}
	.tagline {
		font-style: italic;
	}
	.meta-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		align-items: center;
		font-size: 0.85rem;
		color: var(--ink-secondary);
		margin-bottom: 1.1rem;
	}
	.badge {
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		padding: 0.1rem 0.5rem;
		font-size: 0.8rem;
	}
	.meta-row .badge {
		/* Own background rather than relying on the scrim alone — keeps small badge
		   text legible even over a bright/detailed patch of the backdrop image. */
		background: light-dark(rgba(255, 255, 255, 0.82), rgba(0, 0, 0, 0.5));
		border-color: light-dark(rgba(0, 0, 0, 0.15), rgba(255, 255, 255, 0.18));
		white-space: nowrap;
	}
	.badge.rating {
		color: var(--accent);
		border-color: var(--accent);
	}
	.action-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.icon {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
	}
	.pill.watched {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		background: var(--surface-raised);
		border: 1px solid var(--border-strong);
		color: var(--ink-secondary);
		font-weight: 700;
		padding: 0.5rem 0.9rem;
		transition:
			background 0.15s ease,
			border-color 0.15s ease,
			color 0.15s ease;
	}
	.pill.watched:hover {
		border-color: var(--success);
		color: var(--success);
	}
	.pill.watched.active {
		background: var(--success-bg);
		border-color: var(--success);
		color: var(--success);
	}
	.rate-pill,
	.list-pill {
		align-items: center;
		gap: 0.4rem;
		background: var(--surface-raised);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		padding: 0.15rem 0.15rem 0.15rem 0.65rem;
		color: var(--ink-muted);
	}
	.rate-pill.active {
		background: var(--rate-bg);
		border-color: var(--accent);
		color: var(--accent);
	}
	.rate-pill input {
		width: 3rem;
		border: none;
		background: none;
		padding: 0.2rem;
		color: var(--ink-primary);
	}
	.list-pill select {
		border: none;
		background: none;
		max-width: 9rem;
		color: var(--ink-primary);
	}
	.action-bar button {
		padding: 0.35rem 0.7rem;
	}
	.last-watched {
		font-size: 0.8rem;
		color: var(--ink-muted);
		margin-top: 0.75rem;
	}
	.summary {
		max-width: 46rem;
	}
	.genres {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 1rem 0 2rem;
	}
	.error {
		color: var(--danger);
	}
	.rating-badge {
		color: var(--accent);
		border-color: var(--accent);
	}
	.external-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1.1rem;
	}
	.ext-badge {
		border: 1px solid light-dark(rgba(0, 0, 0, 0.15), rgba(255, 255, 255, 0.18));
		border-radius: var(--radius-sm);
		padding: 0.2rem 0.6rem;
		font-size: 0.75rem;
		font-weight: 700;
		text-decoration: none;
		color: var(--ink-secondary);
		background: light-dark(rgba(255, 255, 255, 0.82), rgba(0, 0, 0, 0.5));
	}
	.ext-badge:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.cast-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
		gap: 1.25rem;
		margin: 1rem 0 2rem;
	}
	.person-card {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		text-decoration: none;
		color: inherit;
		font-size: 0.85rem;
	}
	.person-card span {
		color: var(--ink-muted);
		font-size: 0.78rem;
	}
	.person-photo {
		aspect-ratio: 2 / 3;
		border-radius: var(--radius);
		overflow: hidden;
		background: light-dark(#e5e4df, #232322);
	}
	.person-photo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.seasons-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
		gap: 1rem;
		margin: 1rem 0 2rem;
	}
	.season-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		text-decoration: none;
		color: inherit;
	}
	.season-poster {
		aspect-ratio: 2 / 3;
		border-radius: var(--radius);
		overflow: hidden;
		background: light-dark(#e5e4df, #232322);
	}
	.season-poster img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.placeholder.small {
		font-size: 1.75rem;
	}
	.season-info {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		font-size: 0.85rem;
	}
	.season-info span {
		color: var(--ink-muted);
		font-size: 0.78rem;
	}
	.episodes-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 1rem 0 2rem;
	}
</style>
