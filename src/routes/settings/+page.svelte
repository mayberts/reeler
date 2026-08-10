<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import SecretField from '$lib/components/SecretField.svelte';
	import { ACCENT_COLORS } from '$lib/accent-colors';
	import type { AccentColor } from '$lib/server/db/schema';

	let { data, form } = $props();

	const accentEntries = Object.entries(ACCENT_COLORS) as [
		AccentColor,
		(typeof ACCENT_COLORS)[AccentColor]
	][];

	let accentColor = $state(data.settings.accentColor);
	let twentyFourHourTime = $state(data.settings.twentyFourHourTime);
	let accentPending = $state<AccentColor | null>(null);
	let timeTogglePending = $state(false);

	const webhookUrl = $derived(
		data.settings.plexWebhookToken
			? `${page.url.origin}/api/webhooks/plex/${data.settings.plexWebhookToken}`
			: null
	);

	function sourceHint(source: 'db' | 'env' | 'unset', envVar: string): string {
		if (source === 'env') return `Currently set via the ${envVar} environment variable.`;
		if (source === 'unset')
			return `Not set. Can also be set via the ${envVar} environment variable.`;
		return '';
	}

	async function testTmdb(token: string) {
		const res = await fetch('/api/settings/test-tmdb', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token })
		});
		return res.json();
	}

	async function testTvdb(apiKey: string) {
		const res = await fetch('/api/settings/test-tvdb', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ apiKey })
		});
		return res.json();
	}

	// The Plex token's test button needs the *current, possibly-unsaved* server URL from
	// its sibling field too — read live from the DOM by id rather than threading a second
	// bindable value up through SecretField just for this one cross-field case.
	async function testPlexToken(token: string) {
		const serverUrlInput = document.getElementById('plexServerUrl') as HTMLInputElement | null;
		const res = await fetch('/api/settings/test-plex', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ serverUrl: serverUrlInput?.value ?? '', token })
		});
		return res.json();
	}

	async function setAccentColor(color: AccentColor) {
		if (color === accentColor) return;
		const previous = accentColor;
		accentColor = color; // optimistic — applies instantly via the layout's --accent
		accentPending = color;
		try {
			const body = new FormData();
			body.set('accentColor', color);
			const res = await fetch('?/setAccentColor', { method: 'POST', body });
			if (!res.ok) throw new Error('save failed');
			await invalidateAll();
		} catch {
			accentColor = previous;
		} finally {
			accentPending = null;
		}
	}

	async function setTwentyFourHourTime(value: boolean) {
		const previous = twentyFourHourTime;
		twentyFourHourTime = value;
		timeTogglePending = true;
		try {
			const body = new FormData();
			body.set('value', String(value));
			const res = await fetch('?/setTwentyFourHourTime', { method: 'POST', body });
			if (!res.ok) throw new Error('save failed');
			await invalidateAll();
		} catch {
			twentyFourHourTime = previous;
		} finally {
			timeTogglePending = false;
		}
	}
</script>

<h1>Settings</h1>

<h2 class="section-headline">Plex Connection</h2>

<div class="card">
	{#if form?.card === 'plex' && form.message}
		<p class="error">{form.message}</p>
	{:else if form?.card === 'plex' && form.success}
		<p class="success">Saved.</p>
	{/if}

	<form method="POST" action="?/savePlex" use:enhance class="fields">
		<div class="field">
			<label for="plexServerUrl">Plex Server URL</label>
			<input
				id="plexServerUrl"
				name="plexServerUrl"
				type="text"
				value={data.settings.plexServerUrl ?? ''}
				placeholder="http://your-plex-server:32400"
			/>
			<p class="hint">{sourceHint(data.source.plexServerUrl, 'PLEX_SERVER_URL')}</p>
		</div>

		<SecretField
			label="Plex Token"
			name="plexToken"
			value={data.settings.plexToken ?? ''}
			hint={sourceHint(data.source.plexToken, 'PLEX_TOKEN')}
			onTest={testPlexToken}
		/>

		<SecretField
			label="Plex Webhook Token"
			name="plexWebhookToken"
			value={data.settings.plexWebhookToken ?? ''}
			hint={sourceHint(data.source.plexWebhookToken, 'PLEX_WEBHOOK_TOKEN') ||
				(webhookUrl ? `Webhook URL: ${webhookUrl}` : '')}
		/>

		<div class="field">
			<label for="plexClientIdentifier">Plex Client Identifier</label>
			<input
				id="plexClientIdentifier"
				name="plexClientIdentifier"
				type="text"
				value={data.settings.plexClientIdentifier ?? ''}
				placeholder="any fixed random string"
			/>
			<p class="hint">
				{sourceHint(data.source.plexClientIdentifier, 'PLEX_CLIENT_IDENTIFIER')}
			</p>
		</div>

		<button type="submit" class="primary">Save Changes</button>
	</form>
</div>

<h2 class="section-headline">Metadata Sources</h2>

<div class="card">
	{#if form?.card === 'metadata' && form.message}
		<p class="error">{form.message}</p>
	{:else if form?.card === 'metadata' && form.success}
		<p class="success">Saved.</p>
	{/if}

	<form method="POST" action="?/saveMetadata" use:enhance class="fields">
		<SecretField
			label="TMDB Read Access Token"
			name="tmdbReadAccessToken"
			value={data.settings.tmdbReadAccessToken ?? ''}
			hint={sourceHint(data.source.tmdbReadAccessToken, 'TMDB_API_KEY') ||
				'Paste the API Read Access Token (v4) from TMDB Settings → API. Required for movie/TV metadata and manual logging; validated before saving.'}
			onTest={testTmdb}
		/>

		<SecretField
			label="TVDB API Key"
			name="tvdbApiKey"
			value={data.settings.tvdbApiKey ?? ''}
			hint={sourceHint(data.source.tvdbApiKey, 'TVDB_API_KEY') ||
				'Required for TVDB-sourced shows (shows not on TMDB). Get your key at thetvdb.com.'}
			onTest={testTvdb}
		/>

		<p class="hint">MusicBrainz needs no key — it's used automatically for music.</p>

		<button type="submit" class="primary">Save Changes</button>
	</form>
</div>

<h2 class="section-headline">Display Settings</h2>

<div class="card toggle-card">
	<div class="toggle-row">
		<div>
			<strong>24-hour time format</strong>
			<p class="hint">
				Display watch times in 24-hour format (e.g. 23:31) instead of 12-hour (e.g. 11:31 PM).
			</p>
		</div>
		<button
			type="button"
			class="switch"
			class:on={twentyFourHourTime}
			disabled={timeTogglePending}
			role="switch"
			aria-checked={twentyFourHourTime}
			aria-label="24-hour time format"
			onclick={() => setTwentyFourHourTime(!twentyFourHourTime)}
		>
			<span class="thumb"></span>
		</button>
	</div>
</div>

<p class="accent-label">Accent color</p>
<div class="swatches">
	{#each accentEntries as [key, color] (key)}
		<button
			type="button"
			class="swatch"
			class:current={accentColor === key}
			disabled={accentPending !== null}
			onclick={() => setAccentColor(key)}
		>
			<span class="dot" style="background: {color.hex}"></span>
			{color.label}
		</button>
	{/each}
</div>

<style>
	.card {
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.5rem;
		margin-bottom: 1.5rem;
		max-width: 34rem;
	}
	.fields {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.field label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--ink-secondary);
	}
	.hint {
		margin: 0;
		font-size: 0.78rem;
		color: var(--ink-muted);
	}
	.error {
		color: var(--danger);
		font-size: 0.85rem;
	}
	.success {
		color: var(--success);
		font-size: 0.85rem;
	}
	.primary {
		align-self: flex-start;
		background: var(--accent);
		color: var(--accent-ink);
		border: none;
		font-weight: 700;
		padding: 0.6rem 1.3rem;
	}

	.toggle-card {
		padding: 1.1rem 1.5rem;
	}
	.toggle-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
	}
	.toggle-row strong {
		font-size: 0.95rem;
	}
	.switch {
		flex-shrink: 0;
		width: 2.75rem;
		height: 1.5rem;
		border-radius: 999px;
		background: var(--border-strong);
		border: none;
		padding: 0.15rem;
		display: flex;
		align-items: center;
		cursor: pointer;
		transition: background 0.15s ease;
	}
	.switch.on {
		background: var(--accent);
	}
	.switch .thumb {
		width: 1.2rem;
		height: 1.2rem;
		border-radius: 999px;
		background: white;
		transition: transform 0.15s ease;
	}
	.switch.on .thumb {
		transform: translateX(1.25rem);
	}
	.switch:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.accent-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--ink-secondary);
		margin: 0 0 0.6rem;
	}
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.swatch {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.9rem;
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-weight: 600;
		font-size: 0.85rem;
		color: var(--ink-secondary);
	}
	.swatch.current {
		border-color: var(--ink-primary);
		box-shadow: 0 0 0 1px var(--ink-primary);
	}
	.swatch:disabled {
		opacity: 0.7;
	}
	.dot {
		width: 1rem;
		height: 1rem;
		border-radius: 999px;
		flex-shrink: 0;
	}
</style>
