<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="app">
	<header>
		<a class="brand" href={resolve('/')}>Reeler</a>
		<nav>
			<a href={resolve('/')}>Dashboard</a>
			<a href={resolve('/history')}>History</a>
			<a href={resolve('/ratings')}>Ratings</a>
			<a href={resolve('/lists')}>Lists</a>
		</nav>
	</header>

	<main>
		{@render children()}
	</main>
</div>
