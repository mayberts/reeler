<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	type Status = 'idle' | 'waiting' | 'error';

	let status = $state<Status>('idle');
	let errorMessage = $state('');

	const POLL_INTERVAL_MS = 2000;
	const TIMEOUT_MS = 5 * 60 * 1000;

	async function signIn() {
		status = 'waiting';
		errorMessage = '';

		const startResponse = await fetch('/api/auth/plex/start', { method: 'POST' });
		if (!startResponse.ok) {
			status = 'error';
			errorMessage = "Couldn't reach plex.tv. Try again in a moment.";
			return;
		}

		const { id, authUrl } = await startResponse.json();
		window.open(authUrl, '_blank', 'noopener');
		poll(id);
	}

	function poll(pinId: number) {
		const startedAt = Date.now();

		const interval = setInterval(async () => {
			if (Date.now() - startedAt > TIMEOUT_MS) {
				clearInterval(interval);
				status = 'error';
				errorMessage = "Sign-in timed out — didn't see an approval in time. Try again.";
				return;
			}

			const response = await fetch(`/api/auth/plex/poll?pin=${pinId}`);
			const result = await response.json();

			if (result.status === 'complete') {
				clearInterval(interval);
				await goto(resolve('/'));
			} else if (result.status === 'error') {
				clearInterval(interval);
				status = 'error';
				errorMessage = 'Something went wrong talking to plex.tv. Try again.';
			}
			// 'pending' — keep polling
		}, POLL_INTERVAL_MS);
	}
</script>

<div class="login">
	<h1>Reeler</h1>
	{#if status === 'error'}
		<p class="error">{errorMessage}</p>
	{/if}
	<button type="button" onclick={signIn} disabled={status === 'waiting'}>
		{status === 'waiting' ? 'Waiting for approval in the other tab…' : 'Sign in with Plex'}
	</button>
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
	button:disabled {
		opacity: 0.7;
		cursor: default;
	}
</style>
