<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ACCENT_COLORS } from '$lib/accent-colors';
	import '../app.css';

	let { children, data } = $props();

	const accent = $derived(ACCENT_COLORS[data.accentColor]);

	function isCurrent(href: string) {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}

	interface SearchResult {
		id: string;
		title: string;
		year: number | null;
		type: string;
	}

	let searchQuery = $state('');
	let searchResults: SearchResult[] = $state([]);
	let searchOpen = $state(false);
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	function onSearchInput() {
		clearTimeout(searchTimer);
		const q = searchQuery.trim();
		if (!q) {
			searchResults = [];
			searchOpen = false;
			return;
		}
		searchTimer = setTimeout(async () => {
			const res = await fetch(`/api/media/search?q=${encodeURIComponent(q)}`);
			if (res.ok) {
				const body = await res.json();
				searchResults = body.results;
				searchOpen = searchResults.length > 0;
			}
		}, 200);
	}

	function closeSearch() {
		searchQuery = '';
		searchResults = [];
		searchOpen = false;
	}

	/** Delayed so a click on a result link still registers before the dropdown hides —
	 *  the input's blur otherwise fires first and removes the link from the DOM. */
	function onSearchBlur() {
		setTimeout(() => (searchOpen = false), 150);
	}
</script>

<svelte:head>
	<link rel="icon" href="/favicon.svg?accent={data.accentColor}" type="image/svg+xml" />
</svelte:head>

<div class="shell" style="--accent: {accent.hex}; --accent-ink: {accent.ink};">
	{#if data.user}
		<nav class="rail" aria-label="Primary">
			<a class="rail-brand" href={resolve('/')} aria-label="Reeler">
				<svg viewBox="0 0 100 100" aria-hidden="true">
					<rect x="6" y="6" width="88" height="88" rx="22" fill={accent.hex} />
					<path d="M30 27 L30 73 L60 50 Z" fill={accent.ink} />
					<rect x="64" y="40" width="6" height="20" rx="3" fill={accent.ink} />
					<rect x="74" y="33" width="6" height="34" rx="3" fill={accent.ink} />
					<rect x="84" y="43" width="6" height="14" rx="3" fill={accent.ink} />
				</svg>
			</a>

			<div class="rail-links">
				<a
					class="rail-link"
					href={resolve('/')}
					aria-current={isCurrent('/') ? 'page' : undefined}
					aria-label="Dashboard"
					title="Dashboard"
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline
							points="9 22 9 12 15 12 15 22"
						/></svg
					>
				</a>
				<a
					class="rail-link"
					href={resolve('/movies')}
					aria-current={isCurrent('/movies') ? 'page' : undefined}
					aria-label="Movies"
					title="Movies"
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M7 3v18" /><path
							d="M3 7.5h4"
						/><path d="M3 16.5h4" /><path d="M17 3v18" /><path d="M17 7.5h4" /><path
							d="M17 16.5h4"
						/></svg
					>
				</a>
				<a
					class="rail-link"
					href={resolve('/shows')}
					aria-current={isCurrent('/shows') ? 'page' : undefined}
					aria-label="Shows"
					title="Shows"
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><rect width="20" height="15" x="2" y="7" rx="2" /><polyline
							points="17 2 12 7 7 2"
						/></svg
					>
				</a>
				<a
					class="rail-link"
					href={resolve('/music')}
					aria-current={isCurrent('/music') ? 'page' : undefined}
					aria-label="Music"
					title="Music"
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle
							cx="18"
							cy="16"
							r="3"
						/></svg
					>
				</a>
				<a
					class="rail-link"
					href={resolve('/history')}
					aria-current={isCurrent('/history') ? 'page' : undefined}
					aria-label="History"
					title="History"
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg
					>
				</a>
				<a
					class="rail-link"
					href={resolve('/ratings')}
					aria-current={isCurrent('/ratings') ? 'page' : undefined}
					aria-label="Ratings"
					title="Ratings"
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><polygon
							points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
						/></svg
					>
				</a>
				<a
					class="rail-link"
					href={resolve('/lists')}
					aria-current={isCurrent('/lists') ? 'page' : undefined}
					aria-label="Lists"
					title="Lists"
				>
					<svg
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
						/><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line
							x1="3"
							y1="18"
							x2="3.01"
							y2="18"
						/></svg
					>
				</a>
				<a
					class="rail-link"
					href={resolve('/stats')}
					aria-current={isCurrent('/stats') ? 'page' : undefined}
					aria-label="Stats"
					title="Stats"
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line
							x1="6"
							y1="20"
							x2="6"
							y2="16"
						/></svg
					>
				</a>
				<a
					class="rail-link"
					href={resolve('/badges')}
					aria-current={isCurrent('/badges') ? 'page' : undefined}
					aria-label="Badges"
					title="Badges"
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><circle cx="12" cy="8" r="6" /><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12" /></svg
					>
				</a>
				{#if data.user.isAdmin}
					<a
						class="rail-link"
						href={resolve('/settings')}
						aria-current={isCurrent('/settings') ? 'page' : undefined}
						aria-label="Settings"
						title="Settings"
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							><circle cx="12" cy="12" r="3" /><path
								d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
							/></svg
						>
					</a>
				{/if}
			</div>
		</nav>
	{/if}

	<div class="main-col">
		<header class="topbar">
			{#if data.user}
				<a class="brand mobile-only" href={resolve('/')} aria-label="Reeler">
					<svg viewBox="0 0 100 100" aria-hidden="true">
						<rect x="6" y="6" width="88" height="88" rx="22" fill={accent.hex} />
						<path d="M30 27 L30 73 L60 50 Z" fill={accent.ink} />
						<rect x="64" y="40" width="6" height="20" rx="3" fill={accent.ink} />
						<rect x="74" y="33" width="6" height="34" rx="3" fill={accent.ink} />
						<rect x="84" y="43" width="6" height="14" rx="3" fill={accent.ink} />
					</svg>
				</a>

				<div class="search">
					<svg
						class="search-icon"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg
					>
					<input
						type="search"
						placeholder="Search movies, shows, music…"
						bind:value={searchQuery}
						oninput={onSearchInput}
						onfocus={onSearchInput}
						onblur={onSearchBlur}
						onkeydown={(e) => e.key === 'Escape' && closeSearch()}
					/>
					{#if searchOpen}
						<div class="search-results">
							{#each searchResults as result (result.id)}
								<a
								href={resolve('/media/[id]', { id: result.id })}
								onclick={() => setTimeout(closeSearch, 0)}
							>
									<span class="result-title">{result.title}</span>
									<span class="result-meta"
										>{result.type}{result.year ? ` · ${result.year}` : ''}</span
									>
								</a>
							{/each}
						</div>
					{/if}
				</div>

				<div class="user-area">
					<span class="avatar" aria-hidden="true">{data.user.username.charAt(0).toUpperCase()}</span
					>
					<span class="username">{data.user.username}</span>
					<form method="POST" action={resolve('/logout')}>
						<button type="submit">Sign out</button>
					</form>
				</div>
			{:else}
				<a class="brand" href={resolve('/')}>
					<svg viewBox="0 0 100 100" aria-hidden="true">
						<rect x="6" y="6" width="88" height="88" rx="22" fill={accent.hex} />
						<path d="M30 27 L30 73 L60 50 Z" fill={accent.ink} />
						<rect x="64" y="40" width="6" height="20" rx="3" fill={accent.ink} />
						<rect x="74" y="33" width="6" height="34" rx="3" fill={accent.ink} />
						<rect x="84" y="43" width="6" height="14" rx="3" fill={accent.ink} />
					</svg>
					Reeler
				</a>
			{/if}
		</header>

		<main class="app" class:has-bottom-nav={!!data.user}>
			{@render children()}
		</main>

		{#if data.user}
			<nav class="bottom-nav" aria-label="Primary">
				<a href={resolve('/')} aria-current={isCurrent('/') ? 'page' : undefined}>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline
							points="9 22 9 12 15 12 15 22"
						/></svg
					>
					<span>Dashboard</span>
				</a>
				<a href={resolve('/movies')} aria-current={isCurrent('/movies') ? 'page' : undefined}>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M7 3v18" /><path
							d="M3 7.5h4"
						/><path d="M3 16.5h4" /><path d="M17 3v18" /><path d="M17 7.5h4" /><path
							d="M17 16.5h4"
						/></svg
					>
					<span>Movies</span>
				</a>
				<a href={resolve('/shows')} aria-current={isCurrent('/shows') ? 'page' : undefined}>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><rect width="20" height="15" x="2" y="7" rx="2" /><polyline
							points="17 2 12 7 7 2"
						/></svg
					>
					<span>Shows</span>
				</a>
				<a href={resolve('/music')} aria-current={isCurrent('/music') ? 'page' : undefined}>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle
							cx="18"
							cy="16"
							r="3"
						/></svg
					>
					<span>Music</span>
				</a>
				<a href={resolve('/history')} aria-current={isCurrent('/history') ? 'page' : undefined}>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg
					>
					<span>History</span>
				</a>
				<a href={resolve('/lists')} aria-current={isCurrent('/lists') ? 'page' : undefined}>
					<svg
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
						/><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line
							x1="3"
							y1="18"
							x2="3.01"
							y2="18"
						/></svg
					>
					<span>Lists</span>
				</a>
			</nav>
		{/if}
	</div>
</div>

<style>
	.shell {
		display: flex;
		min-height: 100vh;
	}

	/* Icon rail — desktop only, hidden below the mobile breakpoint in favor of
	   .bottom-nav (see media query). */
	.rail {
		flex-shrink: 0;
		width: 4.5rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		padding: 1rem 0;
		background: var(--surface-raised);
		border-right: 1px solid var(--border);
		position: sticky;
		top: 0;
		height: 100vh;
	}

	.rail-brand {
		display: flex;
		margin-bottom: 0.75rem;
	}

	.rail-brand svg {
		width: 1.65rem;
		height: 1.65rem;
	}

	.rail-links {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.rail-link {
		width: 2.75rem;
		height: 2.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		color: var(--ink-muted);
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}

	.rail-link svg {
		width: 1.25rem;
		height: 1.25rem;
	}

	.rail-link:hover {
		background: var(--border);
		color: var(--ink-primary);
	}

	.rail-link[aria-current='page'] {
		background: var(--accent);
		color: var(--accent-ink);
	}

	.main-col {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.topbar {
		display: flex;
		align-items: center;
		gap: 1rem;
		height: 4rem;
		flex-shrink: 0;
		padding: 0 1.5rem;
		border-bottom: 1px solid var(--border);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 800;
		font-size: 1.15rem;
		text-decoration: none;
		color: var(--ink-primary);
		letter-spacing: -0.01em;
	}

	.brand svg {
		width: 1.5rem;
		height: 1.5rem;
		flex-shrink: 0;
	}

	.brand.mobile-only {
		display: none;
	}

	.search {
		position: relative;
		flex: 1;
		max-width: 28rem;
	}

	.search-icon {
		position: absolute;
		left: 0.8rem;
		top: 50%;
		transform: translateY(-50%);
		width: 1rem;
		height: 1rem;
		color: var(--ink-muted);
		pointer-events: none;
	}

	.search input {
		width: 100%;
		height: 2.5rem;
		padding: 0 0.9rem 0 2.3rem;
		border-radius: 999px;
		border: 1px solid var(--border-strong);
		background: var(--surface-raised);
		color: var(--ink-primary);
		font: inherit;
		font-size: 0.85rem;
	}

	.search input:focus {
		outline: 2px solid var(--accent);
		outline-offset: -1px;
	}

	.search-results {
		position: absolute;
		top: calc(100% + 0.4rem);
		left: 0;
		right: 0;
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
		overflow: hidden;
		z-index: 50;
	}

	.search-results a {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.55rem 0.9rem;
		text-decoration: none;
		color: var(--ink-primary);
		font-size: 0.85rem;
	}

	.search-results a:hover {
		background: var(--border);
	}

	.result-title {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.result-meta {
		flex-shrink: 0;
		font-size: 0.72rem;
		color: var(--ink-muted);
		text-transform: capitalize;
	}

	.user-area {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-shrink: 0;
	}

	.avatar {
		width: 1.8rem;
		height: 1.8rem;
		flex-shrink: 0;
		border-radius: 999px;
		background: var(--accent);
		color: var(--accent-ink);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 800;
		font-size: 0.75rem;
	}

	.username {
		font-size: 0.85rem;
		color: var(--ink-secondary);
	}

	.user-area button {
		padding: 0.3rem 0.7rem;
	}

	main.app {
		max-width: 76rem;
		margin: 0 auto;
		width: 100%;
		padding: 2rem 1.5rem 4rem;
		box-sizing: border-box;
	}

	.bottom-nav {
		display: none;
	}

	@media (max-width: 46rem) {
		.rail {
			display: none;
		}
		.brand.mobile-only {
			display: flex;
		}
		.search {
			max-width: none;
		}
		.username {
			display: none;
		}
		main.has-bottom-nav {
			padding-bottom: 5rem;
		}
		.bottom-nav {
			display: flex;
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
			z-index: 40;
			background: var(--surface-raised);
			border-top: 1px solid var(--border);
			padding-bottom: env(safe-area-inset-bottom);
		}
		.bottom-nav a {
			flex: 1;
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 0.2rem;
			padding: 0.5rem 0.25rem;
			color: var(--ink-muted);
			text-decoration: none;
			font-size: 0.65rem;
			font-weight: 600;
		}
		.bottom-nav a svg {
			width: 1.25rem;
			height: 1.25rem;
		}
		.bottom-nav a[aria-current='page'] {
			color: var(--accent);
		}
	}
</style>
