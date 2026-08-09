<script lang="ts">
	import MediaBrowseGrid from '$lib/components/MediaBrowseGrid.svelte';

	let { data } = $props();
</script>

<MediaBrowseGrid
	heading="Music"
	items={data.items}
	total={data.total}
	search={data.search}
	sort={data.sort}
	emptyText="No albums yet — albums are added automatically the first time you play a track."
	square
/>
