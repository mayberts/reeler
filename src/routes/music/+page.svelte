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
	genres={data.genres}
	watched={data.watched}
	availableGenres={data.availableGenres}
	page={data.page}
	totalPages={data.totalPages}
	myLists={data.myLists}
/>
