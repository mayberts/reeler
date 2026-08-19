<script lang="ts">
	import type { BadgeIconName } from '$lib/server/badges/catalog';

	let { name }: { name: BadgeIconName } = $props();
</script>

<svg
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.8"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if name === 'tv'}
		<rect x="3" y="5" width="18" height="13" rx="2" />
		<path d="M8 21h8M12 18v3" />
	{:else if name === 'clapperboard'}
		<rect x="3" y="9" width="18" height="11" rx="1.5" />
		<path d="M3 9l1.5-5 15 3-1 5z" />
		<path d="M8 5l2 4M13 6l2 4" />
	{:else if name === 'flag'}
		<path d="M5 3v18" />
		<path d="M5 4h11l-2 4 2 4H5" />
	{:else if name === 'clock'}
		<circle cx="12" cy="12" r="9" />
		<path d="M12 7v5l3.5 2" />
	{:else if name === 'flame'}
		<path
			d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5Z"
		/>
	{:else if name === 'compass'}
		<circle cx="12" cy="12" r="9" />
		<path d="M15.5 8.5 13 13l-4.5 2.5L11 11z" />
	{:else if name === 'repeat'}
		<path d="M17 2.5 21 6.5l-4 4" />
		<path d="M3 11.5v-1a4 4 0 0 1 4-4h14" />
		<path d="M7 21.5 3 17.5l4-4" />
		<path d="M21 12.5v1a4 4 0 0 1-4 4H3" />
	{:else if name === 'moon'}
		<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
	{:else if name === 'list'}
		<path d="M8 6h13M8 12h13M8 18h13" />
		<path d="M3 6h.01M3 12h.01M3 18h.01" />
	{:else if name === 'musicNote'}
		<path d="M9 18V5l11-2v13" />
		<circle cx="6" cy="18" r="3" />
		<circle cx="17" cy="16" r="3" />
	{:else if name === 'disc'}
		<circle cx="12" cy="12" r="9" />
		<circle cx="12" cy="12" r="3" />
	{:else if name === 'headphones'}
		<path d="M4 14v-2a8 8 0 0 1 16 0v2" />
		<rect x="2.5" y="14" width="4" height="6" rx="1.5" />
		<rect x="17.5" y="14" width="4" height="6" rx="1.5" />
	{:else if name === 'zap'}
		<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
	{/if}
</svg>
