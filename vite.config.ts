import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			typescript: {
				config: (config) => {
					config.include.push('../drizzle.config.ts');
				}
			},
			// Plex posts webhooks as cross-origin multipart/form-data, which SvelteKit's
			// CSRF check would otherwise reject outright. The webhook route has its own
			// shared-secret token in the URL, so this is safe for now — but revisit if
			// form-based routes (e.g. a login form) are added later, since this disables
			// the check app-wide rather than just for the webhook route.
			csrf: {
				trustedOrigins: ['*']
			}
		})
	]
});
