<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import '../app.css';

	let { children, data } = $props();

	const navLinks = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/history', label: 'History' },
		{ href: '/ratings', label: 'Ratings' },
		{ href: '/lists', label: 'Lists' },
		{ href: '/stats', label: 'Stats' }
	] as const;

	function isCurrent(href: string) {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="app">
	<header>
		<a class="brand" href={resolve('/')}>Reeler</a>
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

	<main>
		{@render children()}
	</main>
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
</style>
