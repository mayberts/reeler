<script lang="ts">
	import MediaBrowseGrid from '$lib/components/MediaBrowseGrid.svelte';

	let { data } = $props();
</script>

<MediaBrowseGrid
	heading="Movies"
	items={data.items}
	total={data.total}
	search={data.search}
	sort={data.sort}
	emptyText="No movies synced yet — run a sync from the dashboard."
	genres={data.genres}
	watched={data.watched}
	availableGenres={data.availableGenres}
	page={data.page}
	totalPages={data.totalPages}
	myLists={data.myLists}
/>
