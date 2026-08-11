import { getAppSettings } from '$lib/server/settings';
import { ACCENT_COLORS } from '$lib/accent-colors';
import type { RequestHandler } from './$types';

/**
 * Served dynamically (not a static asset) so the browser tab icon matches whichever
 * accent color is currently selected — same "Play & Wave" mark and colors as the nav
 * brand mark in +layout.svelte, just rendered server-side since a `<link rel="icon">`
 * loads its target as an opaque image resource with no access to the page's CSS
 * variables. The layout keys the `<link>`'s href on `accentColor` (`?accent=...`) so
 * changing it in Settings busts the browser's aggressive favicon caching immediately
 * instead of only on the next full reload.
 */
export const GET: RequestHandler = async () => {
	const { accentColor } = await getAppSettings();
	const { hex, ink } = ACCENT_COLORS[accentColor];

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>Reeler</title><rect x="6" y="6" width="88" height="88" rx="22" fill="${hex}"/><path d="M30 27 L30 73 L60 50 Z" fill="${ink}"/><rect x="64" y="40" width="6" height="20" rx="3" fill="${ink}"/><rect x="74" y="33" width="6" height="34" rx="3" fill="${ink}"/><rect x="84" y="43" width="6" height="14" rx="3" fill="${ink}"/></svg>`;

	return new Response(svg, {
		headers: {
			'Content-Type': 'image/svg+xml',
			// The query string already keys this by accent color, so the response
			// itself is safe to cache indefinitely under that URL.
			'Cache-Control': 'public, max-age=31536000, immutable'
		}
	});
};
