<script lang="ts">
	import { resolve } from '$app/paths';

	interface PreviewItem {
		id: string;
		plexThumb: string | null;
		artworkUrl: string | null;
	}

	interface Props {
		id: string;
		name: string;
		description?: string | null;
		isShared: boolean;
		itemCount: number;
		ownerUsername?: string;
		previewItems: PreviewItem[];
	}

	let { id, name, description, isShared, itemCount, ownerUsername, previewItems }: Props = $props();

	function posterSrc(item: PreviewItem) {
		return item.plexThumb || item.artworkUrl ? `/api/media/${item.id}/poster` : null;
	}
</script>

<a class="card" href={resolve('/lists/[id]', { id })}>
	<div class="stack">
		{#if previewItems.length === 0}
			<div class="placeholder-icon" aria-hidden="true">
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path
						d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"
					/></svg
				>
			</div>
		{/if}
		{#each previewItems.slice(0, 3).reverse() as item, i (item.id)}
			<div class="stack-poster" style="--i: {previewItems.length - 1 - i}">
				{#if posterSrc(item)}
					<img src={posterSrc(item)} alt="" />
				{:else}
					<div class="stack-placeholder"></div>
				{/if}
			</div>
		{/each}
	</div>

	<div class="info">
		<div class="title-row">
			{#if isShared && !ownerUsername}
				<svg
					class="shared-icon"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path
						d="M7 11V7a5 5 0 0 1 10 0v4"
					/></svg
				>
			{/if}
			<span class="name">{name}</span>
		</div>
		{#if description}
			<p class="description">{description}</p>
		{/if}
		<p class="meta">
			{itemCount}
			{itemCount === 1 ? 'item' : 'items'}
			{#if ownerUsername}&middot; by {ownerUsername}{/if}
		</p>
	</div>
</a>

<style>
	.card {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		padding: 1rem 1.1rem;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: var(--surface-raised);
		color: inherit;
		text-decoration: none;
		transition:
			border-color 0.2s ease,
			transform 0.2s ease;
	}
	.card:hover {
		border-color: var(--accent);
		transform: translateY(-2px);
	}
	.stack {
		position: relative;
		flex-shrink: 0;
		width: 3.5rem;
		height: 4.5rem;
	}
	.placeholder-icon {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		background: var(--border);
		color: var(--ink-muted);
	}
	.placeholder-icon svg {
		width: 1.4rem;
		height: 1.4rem;
	}
	.stack-poster {
		position: absolute;
		inset: 0;
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: light-dark(#e5e4df, #232322);
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
		transform: rotate(calc(var(--i) * 4deg));
	}
	.stack-poster img,
	.stack-placeholder {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.stack-placeholder {
		background: var(--border);
	}
	.info {
		min-width: 0;
		flex: 1;
	}
	.title-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.shared-icon {
		width: 0.8rem;
		height: 0.8rem;
		color: var(--ink-muted);
		flex-shrink: 0;
	}
	.name {
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.description {
		font-size: 0.8rem;
		color: var(--ink-muted);
		margin: 0.15rem 0 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.meta {
		font-size: 0.75rem;
		color: var(--ink-muted);
		margin: 0.3rem 0 0;
	}
</style>
