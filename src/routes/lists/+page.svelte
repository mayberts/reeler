<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';

	let { data, form } = $props();
</script>

<h1>Lists</h1>

{#if form?.message}
	<p class="error">{form.message}</p>
{/if}

{#if data.lists.length === 0}
	<p class="empty">No lists yet — create one below.</p>
{:else}
	<ul class="lists">
		{#each data.lists as list (list.id)}
			<li>
				<a href={resolve('/lists/[id]', { id: list.id })}>{list.name}</a>
				{#if list.isShared}<span class="badge">shared</span>{/if}
				<span class="owner">by {list.owner.username}</span>
			</li>
		{/each}
	</ul>
{/if}

<h2>New list</h2>
<form method="POST" action="?/create" use:enhance>
	<input type="text" name="name" placeholder="List name" required />
	<input type="text" name="description" placeholder="Description (optional)" />
	<label><input type="checkbox" name="isShared" /> Shared with everyone</label>
	<button type="submit" class="primary">Create</button>
</form>

<style>
	.lists {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin: 1rem 0 2rem;
	}
	.lists li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.65rem 0.75rem;
		border-radius: var(--radius-sm);
		margin: 0 -0.75rem;
	}
	.lists li:hover {
		background: var(--surface-raised);
	}
	.lists a {
		color: inherit;
		font-weight: 600;
		text-decoration: none;
	}
	.lists a:hover {
		text-decoration: underline;
	}
	.badge {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		border: 1px solid currentColor;
		border-radius: 0.25rem;
		padding: 0.05rem 0.35rem;
		opacity: 0.75;
	}
	.owner {
		margin-left: auto;
		font-size: 0.85rem;
		opacity: 0.6;
	}
	.error {
		color: var(--danger);
	}
</style>
