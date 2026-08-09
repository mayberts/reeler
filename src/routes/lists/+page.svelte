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
	<p>No lists yet — create one below.</p>
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
	<button type="submit">Create</button>
</form>

<style>
	.lists {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 2rem;
	}
	.lists li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.4rem 0;
		border-bottom: 1px solid light-dark(#eee, #2a2a2a);
	}
	.lists a {
		color: inherit;
		font-weight: 600;
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
	form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}
	.error {
		color: light-dark(#b91c1c, #f87171);
	}
</style>
