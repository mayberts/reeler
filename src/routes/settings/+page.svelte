<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import SecretField from '$lib/components/SecretField.svelte';
	import { ACCENT_COLORS } from '$lib/accent-colors';
	import type { AccentColor } from '$lib/server/db/schema';

	const TABS = [
		{ id: 'plex', label: 'Plex Connection' },
		{ id: 'sync', label: 'Library Sync' },
		{ id: 'metadata', label: 'Metadata Sources' },
		{ id: 'display', label: 'Display' }
	] as const;
	type TabId = (typeof TABS)[number]['id'];

	function tabFromUrl(): TabId {
		const requested = page.url.searchParams.get('tab');
		return TABS.some((t) => t.id === requested) ? (requested as TabId) : 'plex';
	}

	// Kept in the URL (via replaceState, no navigation/reload) rather than plain local
	// state — lets a link elsewhere in the app point straight at e.g. Settings ->
	// Metadata, and survives a refresh instead of always bouncing back to the first tab.
	let activeTab = $state<TabId>(tabFromUrl());

	function selectTab(tab: TabId) {
		activeTab = tab;
		replaceState(resolve(`/settings?tab=${tab}`), {});
	}

	let { data, form } = $props();

	const accentEntries = Object.entries(ACCENT_COLORS) as [
		AccentColor,
		(typeof ACCENT_COLORS)[AccentColor]
	][];

	let accentColor = $state(data.settings.accentColor);
	let twentyFourHourTime = $state(data.settings.twentyFourHourTime);
	let accentPending = $state<AccentColor | null>(null);
	let timeTogglePending = $state(false);
	let syncing = $state(false);
	let fullHistorySyncing = $state(false);
	let pushingHistory = $state(false);

	const webhookUrl = $derived(
		data.settings.plexWebhookToken
			? `${page.url.origin}/api/webhooks/plex/${data.settings.plexWebhookToken}`
			: null
	);

	/** `warn: true` means the field is only working because of an env var right now —
	 *  nothing has actually been saved to the database, so removing that env var (or
	 *  moving to a deploy that doesn't set it) will blank this out with no way back
	 *  short of re-entering it here. Surfaced as a distinctly-colored hint, not just
	 *  the same muted note as an actually-empty field, since those two states look
	 *  identical in the input itself (both show the value, or lack of one) but have
	 *  very different consequences. */
	function sourceHint(
		source: 'db' | 'env' | 'unset',
		envVar: string
	): { text: string; warn: boolean } {
		if (source === 'env') {
			return {
				text: `Using the ${envVar} environment variable — not saved in the database yet. Click Save Changes to store it here so it survives ${envVar} being removed.`,
				warn: true
			};
		}
		if (source === 'unset') {
			return {
				text: `Not set. Can also be set via the ${envVar} environment variable.`,
				warn: false
			};
		}
		return { text: '', warn: false };
	}

	const serverUrlHint = $derived(sourceHint(data.source.plexServerUrl, 'PLEX_SERVER_URL'));
	const plexTokenHint = $derived(sourceHint(data.source.plexToken, 'PLEX_TOKEN'));
	const webhookHint = $derived(sourceHint(data.source.plexWebhookToken, 'PLEX_WEBHOOK_TOKEN'));
	const clientIdHint = $derived(
		sourceHint(data.source.plexClientIdentifier, 'PLEX_CLIENT_IDENTIFIER')
	);
	const tmdbHint = $derived(sourceHint(data.source.tmdbReadAccessToken, 'TMDB_API_KEY'));
	const tvdbHint = $derived(sourceHint(data.source.tvdbApiKey, 'TVDB_API_KEY'));

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

<div class="settings-layout">
	<nav class="settings-nav" aria-label="Settings sections">
		{#each TABS as tab (tab.id)}
			<button type="button" class:active={activeTab === tab.id} onclick={() => selectTab(tab.id)}>
				{tab.label}
			</button>
		{/each}
	</nav>

	<div class="settings-content">
		{#if activeTab === 'plex'}
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
						{#if serverUrlHint.text}
							<p class="hint" class:warn={serverUrlHint.warn}>{serverUrlHint.text}</p>
						{/if}
					</div>

					<SecretField
						label="Plex Token"
						name="plexToken"
						value={data.settings.plexToken ?? ''}
						hint={plexTokenHint.text}
						hintWarn={plexTokenHint.warn}
						onTest={testPlexToken}
					/>

					<SecretField
						label="Plex Webhook Token"
						name="plexWebhookToken"
						value={data.settings.plexWebhookToken ?? ''}
						hint={webhookHint.text || (webhookUrl ? `Webhook URL: ${webhookUrl}` : '')}
						hintWarn={webhookHint.warn}
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
						{#if clientIdHint.text}
							<p class="hint" class:warn={clientIdHint.warn}>{clientIdHint.text}</p>
						{/if}
					</div>

					<button type="submit" class="primary">Save Changes</button>
				</form>
			</div>
		{/if}

		{#if activeTab === 'sync'}
			<h2 class="section-headline">Library Sync</h2>

			<div class="card">
				<dl class="stats">
					<div>
						<dt>Users</dt>
						<dd>{data.userCount}</dd>
					</div>
					<div>
						<dt>Media items</dt>
						<dd>{data.mediaCount}</dd>
					</div>
					<div>
						<dt>Watch history entries</dt>
						<dd>{data.historyCount}</dd>
					</div>
				</dl>

				<form
					method="POST"
					action="?/sync"
					use:enhance={() => {
						syncing = true;
						return async ({ update }) => {
							await update();
							syncing = false;
						};
					}}
				>
					<button type="submit" class="primary" disabled={syncing}
						>{syncing ? 'Syncing…' : 'Sync now'}</button
					>
				</form>

				{#if form?.card === 'sync' && form.success}
					<p class="success">
						Synced {form.library.itemsUpserted} library items, {form.history.entriesInserted} new history
						entries{form.library.watchedFromViewCount > 0
							? `, ${form.library.watchedFromViewCount} watched status repaired from Plex`
							: ''}{form.repair.fixed > 0
							? `, repaired ${form.repair.fixed} track-to-album links`
							: ''}.
					</p>
				{:else if form?.card === 'sync' && form.message}
					<p class="error">{form.message}</p>
				{/if}

				<div class="subsection">
					<strong>Pull history from Plex</strong>
					<p class="hint">
						Re-pulls every linked user's entire watch history from Plex, not just recent activity —
						for recovering lost or corrupted history in <em>Reeler</em>, using Plex as the source of
						truth. Doesn't run on a schedule or on restart, and is safe to run more than once (it
						only fills gaps, never duplicates). Can take a while on a large history.
					</p>

					<form
						method="POST"
						action="?/fullHistorySync"
						use:enhance={() => {
							fullHistorySyncing = true;
							return async ({ update }) => {
								await update();
								fullHistorySyncing = false;
							};
						}}
					>
						<button type="submit" disabled={fullHistorySyncing}
							>{fullHistorySyncing ? 'Pulling…' : 'Pull all watch history from Plex'}</button
						>
					</form>

					{#if form?.card === 'fullHistorySync' && form.success}
						<p class="success">
							Scanned {form.entriesSeen} history entries across {form.usersScanned} user{form.usersScanned ===
							1
								? ''
								: 's'}, added {form.entriesInserted} new watch history entr{form.entriesInserted ===
							1
								? 'y'
								: 'ies'}.
						</p>
					{:else if form?.card === 'fullHistorySync' && form.message}
						<p class="error">{form.message}</p>
					{/if}
				</div>

				<div class="subsection">
					<strong>Push history to Plex</strong>
					<p class="hint">
						Restores watch history in <em>Plex</em> from Reeler, for recovering a Plex-side loss (a database
						reset, a re-added library) using Reeler as the source of truth. Only marks items watched —
						Plex's API has no way to set a historical date, so restored items will show as watched "just
						now" in Plex, not on their original date. Only restores the Plex server owner's own history
						(Reeler has no way to write history for other Plex Home members), and never touches an item
						Plex already shows as watched. Not on a schedule or on restart, and safe to run more than
						once.
					</p>

					<form
						method="POST"
						action="?/pushHistory"
						use:enhance={() => {
							pushingHistory = true;
							return async ({ update }) => {
								await update();
								pushingHistory = false;
							};
						}}
					>
						<button type="submit" disabled={pushingHistory}
							>{pushingHistory ? 'Pushing…' : 'Push watch history to Plex'}</button
						>
					</form>

					{#if form?.card === 'pushHistory' && form.success}
						<p class="success">
							Scanned {form.itemsScanned} watched item{form.itemsScanned === 1 ? '' : 's'}, marked {form.itemsPushed}
							as watched in Plex{form.itemsSkipped > 0
								? ` (${form.itemsSkipped} already watched there or skipped)`
								: ''}.
						</p>
					{:else if form?.card === 'pushHistory' && form.message}
						<p class="error">{form.message}</p>
					{/if}
				</div>
			</div>
		{/if}

		{#if activeTab === 'metadata'}
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
						hint={tmdbHint.text ||
							'Paste the API Read Access Token (v4) from TMDB Settings → API. Required for movie/TV metadata and manual logging; validated before saving.'}
						hintWarn={tmdbHint.warn}
						onTest={testTmdb}
					/>

					<SecretField
						label="TVDB API Key"
						name="tvdbApiKey"
						value={data.settings.tvdbApiKey ?? ''}
						hint={tvdbHint.text ||
							'Required for TVDB-sourced shows (shows not on TMDB). Get your key at thetvdb.com.'}
						hintWarn={tvdbHint.warn}
						onTest={testTvdb}
					/>

					<p class="hint">MusicBrainz needs no key — it's used automatically for music.</p>

					<button type="submit" class="primary">Save Changes</button>
				</form>
			</div>
		{/if}

		{#if activeTab === 'display'}
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
		{/if}
	</div>
</div>

<style>
	.settings-layout {
		display: flex;
		align-items: flex-start;
		gap: 2.5rem;
	}
	.settings-nav {
		flex: 0 0 12rem;
		position: sticky;
		top: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.settings-nav button {
		text-align: left;
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		padding: 0.55rem 0.75rem;
		font-weight: 600;
		font-size: 0.9rem;
		color: var(--ink-secondary);
	}
	.settings-nav button:hover:not(.active) {
		background: var(--surface-raised);
		color: var(--ink-primary);
	}
	.settings-nav button.active {
		background: var(--accent);
		color: var(--accent-ink);
	}
	.settings-content {
		flex: 1 1 auto;
		min-width: 0;
	}
	.settings-content .section-headline {
		margin-top: 0;
	}

	@media (max-width: 40rem) {
		.settings-layout {
			flex-direction: column;
			gap: 1.5rem;
		}
		.settings-nav {
			position: static;
			flex-direction: row;
			flex-wrap: wrap;
			width: 100%;
		}
	}

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
	.stats {
		display: flex;
		gap: 2.5rem;
		margin: 0 0 1.25rem;
	}
	.stats dt {
		font-size: 0.85rem;
		opacity: 0.65;
	}
	.stats dd {
		margin: 0;
		font-size: 1.75rem;
		font-weight: 600;
	}
	.subsection {
		margin-top: 1.25rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: flex-start;
	}
	.subsection strong {
		font-size: 0.95rem;
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
	.hint.warn {
		color: var(--accent);
		font-weight: 600;
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
