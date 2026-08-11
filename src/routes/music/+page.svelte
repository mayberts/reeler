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
	searchPlaceholder="Filter by album or artist"
	square
	showWatched={false}
	sortOptions={[
		{ value: 'title', label: 'Album (A–Z)' },
		{ value: 'artist', label: 'Artist (A–Z)' },
		{ value: 'year', label: 'Year' },
		{ value: 'added', label: 'Recently added' }
	]}
	genres={data.genres}
	watched={data.watched}
	availableGenres={data.availableGenres}
	page={data.page}
	totalPages={data.totalPages}
	myLists={data.myLists}
/>
