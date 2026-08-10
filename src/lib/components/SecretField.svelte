<script lang="ts">
	interface Props {
		label: string;
		name: string;
		value?: string;
		placeholder?: string;
		hint?: string;
		/** Renders a password-style field with a show/hide toggle. Off for plain fields like a URL. */
		masked?: boolean;
		/** Renders a "test" button that validates the field's *current* (possibly unsaved)
		 *  value against the real service, without saving anything. */
		onTest?: (value: string) => Promise<{ ok: boolean; message: string }>;
	}

	let { label, name, value = '', placeholder, hint, masked = true, onTest }: Props = $props();

	let liveValue = $state(value);
	let revealed = $state(false);
	let testing = $state(false);
	let testResult = $state<{ ok: boolean; message: string } | null>(null);

	async function runTest() {
		if (!onTest || testing) return;
		testing = true;
		testResult = null;
		try {
			testResult = await onTest(liveValue);
		} finally {
			testing = false;
		}
	}
</script>

<div class="field">
	<label for={name}>{label}</label>
	<div class="row">
		<div class="input-wrap">
			<input
				id={name}
				{name}
				type={masked && !revealed ? 'password' : 'text'}
				bind:value={liveValue}
				{placeholder}
				autocomplete="off"
				spellcheck="false"
			/>
			{#if masked}
				<button
					type="button"
					class="reveal"
					onclick={() => (revealed = !revealed)}
					title={revealed ? 'Hide' : 'Show'}
					aria-label={revealed ? 'Hide value' : 'Show value'}
				>
					<svg
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
						/></svg
					>
				</button>
			{/if}
		</div>
		{#if onTest}
			<button type="button" class="test" disabled={testing || !liveValue} onclick={runTest}>
				{#if testing}
					<span class="spinner"></span>
				{:else}
					<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" class="play"
						><polygon points="6 4 20 12 6 20" /></svg
					>
				{/if}
			</button>
		{/if}
	</div>
	{#if hint}<p class="hint">{hint}</p>{/if}
	{#if testResult}
		<p class="test-result" class:ok={testResult.ok} class:err={!testResult.ok}>
			{testResult.ok ? '✓' : '✗'}
			{testResult.message}
		</p>
	{/if}
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--ink-secondary);
	}
	.row {
		display: flex;
		gap: 0.5rem;
	}
	.input-wrap {
		position: relative;
		flex: 1;
		min-width: 0;
	}
	.input-wrap input {
		width: 100%;
		padding-right: 2.5rem;
	}
	.reveal {
		position: absolute;
		top: 50%;
		right: 0.5rem;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.8rem;
		height: 1.8rem;
		padding: 0;
		background: transparent;
		border: none;
		color: var(--ink-muted);
	}
	.reveal svg {
		width: 1.1rem;
		height: 1.1rem;
	}
	.test {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		background: var(--surface);
		border: 1px solid var(--border-strong);
	}
	.play {
		width: 0.9rem;
		height: 0.9rem;
	}
	.spinner {
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 999px;
		border: 2px solid var(--border-strong);
		border-top-color: var(--ink-secondary);
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.hint {
		margin: 0;
		font-size: 0.78rem;
		color: var(--ink-muted);
	}
	.test-result {
		margin: 0;
		font-size: 0.8rem;
		font-weight: 600;
	}
	.test-result.ok {
		color: var(--success);
	}
	.test-result.err {
		color: var(--danger);
	}
</style>
