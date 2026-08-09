<script lang="ts">
	let { data } = $props();
</script>

<h1>Dashboard</h1>
<p>
	Scaffold status: database connected, no Plex sync wired up yet (see
	<a href="https://github.com/mayberts/reeler/blob/main/DESIGN.md">DESIGN.md</a>).
</p>

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

<style>
	.stats {
		display: flex;
		gap: 2.5rem;
		margin-top: 1.5rem;
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
</style>
