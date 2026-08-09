<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	type Status = 'idle' | 'waiting' | 'error';

	let status = $state<Status>('idle');
	let errorMessage = $state('');

	const POLL_INTERVAL_MS = 2000;
	const TIMEOUT_MS = 5 * 60 * 1000;

	const AUTH_WINDOW_NAME = 'reeler-plex-auth';

	let activePinId: number | null = null;
	let pollStartedAt = 0;
	let pollHandle: ReturnType<typeof setInterval> | undefined;

	async function signIn() {
		status = 'waiting';
		errorMessage = '';

		// Opened synchronously, before any await, so browsers don't treat it as a blocked
		// popup — only navigating it to the real URL happens after the fetch below.
		window.open('', AUTH_WINDOW_NAME);

		const startResponse = await fetch('/api/auth/plex/start', { method: 'POST' });
		if (!startResponse.ok) {
			status = 'error';
			errorMessage = "Couldn't reach plex.tv. Try again in a moment.";
			return;
		}

		const { id, authUrl } = await startResponse.json();
		// Navigating a window by name (rather than holding a JS reference) still works
		// after the async gap above, and isn't treated as a new popup to block.
		window.open(authUrl, AUTH_WINDOW_NAME, 'noopener');

		activePinId = id;
		pollStartedAt = Date.now();
		checkOnce();
		pollHandle = setInterval(checkOnce, POLL_INTERVAL_MS);
	}

	function stopPolling() {
		if (pollHandle) clearInterval(pollHandle);
		pollHandle = undefined;
		activePinId = null;
	}

	async function checkOnce() {
		if (activePinId === null) return;

		if (Date.now() - pollStartedAt > TIMEOUT_MS) {
			stopPolling();
			status = 'error';
			errorMessage = "Sign-in timed out — didn't see an approval in time. Try again.";
			return;
		}

		const response = await fetch(`/api/auth/plex/poll?pin=${activePinId}`);

		// Any non-OK response (a crash, a proxy error page, ...) is treated the same as
		// an explicit { status: 'error' } — never silently keep polling against
		// something broken.
		if (!response.ok) {
			stopPolling();
			status = 'error';
			errorMessage = 'Something went wrong talking to plex.tv. Try again.';
			return;
		}

		const result = await response.json();

		if (result.status === 'complete') {
			stopPolling();
			await goto(resolve('/'));
		} else if (result.status === 'error') {
			stopPolling();
			status = 'error';
			errorMessage = 'Something went wrong talking to plex.tv. Try again.';
		}
		// 'pending' — keep polling
	}

	// Backgrounded tabs can have their timers throttled or fully frozen (Edge's
	// "sleeping tabs" among others) — recheck immediately whenever this tab regains
	// focus, instead of relying solely on the interval to eventually catch up.
	function handleVisibilityChange() {
		if (document.visibilityState === 'visible' && activePinId !== null) checkOnce();
	}
</script>

<svelte:window onfocus={handleVisibilityChange} />
<svelte:document onvisibilitychange={handleVisibilityChange} />

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
