<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const item = $derived(data.item);
	const isMusic = $derived(item.type === 'track' || item.type === 'album');

	const posterSrc = $derived(
		item.plexThumb || item.artworkUrl ? `/api/media/${item.id}/poster` : null
	);
	const backdropSrc = $derived(
		item.plexArt || item.backdropUrl ? `/api/media/${item.id}/backdrop` : null
	);

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
</script>

<div class="hero" class:has-backdrop={!!backdropSrc}>
	{#if backdropSrc}
		<img class="backdrop" src={backdropSrc} alt="" />
		<div class="scrim"></div>
	{/if}
	<div class="hero-inner">
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
				{#if item.year}<span>{item.year}</span>{/if}
				{#if runtime}<span>{runtime}</span>{/if}
				{#if item.contentRating}<span class="badge">{item.contentRating}</span>{/if}
				{#if data.myRating !== null}<span class="badge rating">★ {data.myRating}/10</span>{/if}
			</div>

			<div class="action-bar">
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
			{#if data.lastWatchedAt}
				<p class="last-watched">Last watched {data.lastWatchedAt.toLocaleDateString()}</p>
			{/if}
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

<style>
	.hero {
		position: relative;
		margin: 0 -1.5rem 2rem;
		padding: 2rem 1.5rem;
	}
	.hero.has-backdrop {
		padding-top: 3rem;
		padding-bottom: 2.5rem;
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
		background: linear-gradient(
			180deg,
			var(--surface) 0%,
			rgba(0, 0, 0, 0.55) 40%,
			var(--surface) 100%
		);
		z-index: 1;
	}
	:root:not([data-theme='dark']) .scrim {
		background: linear-gradient(
			180deg,
			var(--surface) 0%,
			rgba(255, 255, 255, 0.35) 40%,
			var(--surface) 100%
		);
	}
	.hero-inner {
		position: relative;
		z-index: 2;
		display: flex;
		gap: 1.5rem;
		max-width: 60rem;
		margin: 0 auto;
	}
	.poster {
		flex: 0 0 9rem;
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
		flex: 1;
		min-width: 0;
	}
	.hero-text h1 {
		margin-bottom: 0.35rem;
	}
	.subtitle {
		color: var(--ink-secondary);
		margin: 0 0 0.75rem;
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
</style>
