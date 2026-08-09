<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import '../app.css';

	let { children, data } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="app">
	<header>
		<a class="brand" href={resolve('/')}>Reeler</a>
		{#if data.user}
			<nav>
				<a href={resolve('/')}>Dashboard</a>
				<a href={resolve('/history')}>History</a>
				<a href={resolve('/ratings')}>Ratings</a>
				<a href={resolve('/lists')}>Lists</a>
				<a href={resolve('/stats')}>Stats</a>
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
		font: inherit;
		padding: 0.3rem 0.7rem;
		border-radius: 0.3rem;
		border: 1px solid light-dark(#ccc, #444);
		background: none;
		color: inherit;
		cursor: pointer;
	}
</style>
