<script lang="ts">
	let { data } = $props();

	const errorMessages: Record<string, string> = {
		missing_pin: 'Sign-in expired before it could complete. Try again.',
		not_approved: "Plex didn't confirm the sign-in. Try again.",
		plex_unreachable: "Couldn't reach plex.tv. Try again in a moment."
	};
</script>

<div class="login">
	<h1>Reeler</h1>
	{#if data.error}
		<p class="error">{errorMessages[data.error] ?? 'Something went wrong. Try again.'}</p>
	{/if}
	<form method="POST">
		<button type="submit">Sign in with Plex</button>
	</form>
</div>

<style>
	.login {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		margin-top: 4rem;
	}
	.error {
		color: light-dark(#b91c1c, #f87171);
	}
	button {
		font-size: 1rem;
		padding: 0.6rem 1.2rem;
		border-radius: 0.4rem;
		border: none;
		background: #e5a00d;
		color: #1a1a1a;
		font-weight: 600;
		cursor: pointer;
	}
</style>
