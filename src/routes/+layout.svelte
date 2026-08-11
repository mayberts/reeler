<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ACCENT_COLORS } from '$lib/accent-colors';
	import '../app.css';

	let { children, data } = $props();

	const accent = $derived(ACCENT_COLORS[data.accentColor]);

	const navLinks = $derived([
		{ href: '/', label: 'Dashboard' },
		{ href: '/movies', label: 'Movies' },
		{ href: '/shows', label: 'Shows' },
		{ href: '/music', label: 'Music' },
		{ href: '/history', label: 'History' },
		{ href: '/ratings', label: 'Ratings' },
		{ href: '/lists', label: 'Lists' },
		{ href: '/stats', label: 'Stats' },
		...(data.user?.isAdmin ? [{ href: '/settings', label: 'Settings' }] : [])
	] as const);

	function isCurrent(href: string) {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}
</script>

<svelte:head>
	<link rel="icon" href="/favicon.svg?accent={data.accentColor}" type="image/svg+xml" />
</svelte:head>

<div class="app" style="--accent: {accent.hex}; --accent-ink: {accent.ink};">
	<header>
		<a class="brand" href={resolve('/')}>
			<svg class="brand-mark" viewBox="0 0 100 100" aria-hidden="true">
				<rect x="6" y="6" width="88" height="88" rx="22" fill={accent.hex} />
				<path d="M30 27 L30 73 L60 50 Z" fill={accent.ink} />
				<rect x="64" y="40" width="6" height="20" rx="3" fill={accent.ink} />
				<rect x="74" y="33" width="6" height="34" rx="3" fill={accent.ink} />
				<rect x="84" y="43" width="6" height="14" rx="3" fill={accent.ink} />
			</svg>
			Reeler
		</a>
		{#if data.user}
			<nav>
				{#each navLinks as link (link.href)}
					<a
						href={resolve(link.href as '/')}
						aria-current={isCurrent(link.href) ? 'page' : undefined}>{link.label}</a
					>
				{/each}
			</nav>
			<form method="POST" action={resolve('/logout')} class="logout">
				<span>{data.user.username}</span>
				<button type="submit">Sign out</button>
			</form>
		{/if}
	</header>

	<main class:has-bottom-nav={!!data.user}>
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

<style>
	.logout {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.logout span {
		opacity: 0.75;
		font-size: 0.9rem;
	}
	.logout button {
		padding: 0.3rem 0.7rem;
	}

	.bottom-nav {
		display: none;
	}

	@media (max-width: 46rem) {
		header nav {
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
