<script lang="ts">
	import MediaBrowseGrid from '$lib/components/MediaBrowseGrid.svelte';

	let { data } = $props();
</script>

<MediaBrowseGrid
	heading="Shows"
	items={data.items}
	total={data.total}
	search={data.search}
	sort={data.sort}
	emptyText="No shows synced yet — run a sync from the dashboard."
/>
