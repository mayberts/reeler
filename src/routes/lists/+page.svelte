<script lang="ts">
	import { enhance } from '$app/forms';
	import ListCard from '$lib/components/ListCard.svelte';

	let { data, form } = $props();
	let creating = $state(false);
</script>

<h1>Lists</h1>

{#if form?.message}
	<p class="error">{form.message}</p>
{/if}

{#if data.lists.length === 0}
	<p class="empty">No lists yet — create one below.</p>
{:else}
	<div class="lists-grid">
		{#each data.lists as list (list.id)}
			<ListCard
				id={list.id}
				name={list.name}
				description={list.description}
				isShared={list.isShared}
				itemCount={list.itemCount}
				ownerUsername={list.ownerId === data.userId ? undefined : list.owner.username}
				previewItems={list.previewItems}
			/>
		{/each}
	</div>
{/if}

<details class="new-list" bind:open={creating}>
	<summary>+ New list</summary>
	<form method="POST" action="?/create" use:enhance>
		<input type="text" name="name" placeholder="List name" required />
		<input type="text" name="description" placeholder="Description (optional)" />
		<label><input type="checkbox" name="isShared" /> Shared with everyone</label>
		<button type="submit" class="primary">Create</button>
	</form>
</details>

<style>
	.lists-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
		gap: 1rem;
		margin: 1.25rem 0 2rem;
	}
	.new-list summary {
		list-style: none;
		display: inline-flex;
		align-items: center;
		padding: 0.5rem 0.9rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-strong);
		background: var(--surface-raised);
		cursor: pointer;
		font-weight: 600;
		font-size: 0.9rem;
	}
	.new-list summary::-webkit-details-marker {
		display: none;
	}
	.new-list form {
		margin-top: 1rem;
	}
	.error {
		color: var(--danger);
	}
</style>
