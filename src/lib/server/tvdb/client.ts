const TVDB_BASE = 'https://api4.thetvdb.com/v4';

interface TvdbLoginResponse {
	status: string;
	data?: { token?: string };
}

// TVDB v4 exchanges the admin-supplied API key for a short-lived bearer JWT (~1 month)
// via a login call, unlike TMDb's static bearer token — cached in-memory per key so a
// search doesn't re-login on every request. Keyed by the API key itself (not a single
// slot) so a key rotated via the Settings page doesn't serve a stale token for the old one.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const TOKEN_TTL_MS = 20 * 24 * 60 * 60 * 1000; // conservative vs. TVDB's ~1 month expiry

async function login(apiKey: string): Promise<string | null> {
	const cached = tokenCache.get(apiKey);
	if (cached && cached.expiresAt > Date.now()) return cached.token;

	const response = await fetch(`${TVDB_BASE}/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ apikey: apiKey })
	});
	if (!response.ok) return null;

	const data: TvdbLoginResponse = await response.json();
	const token = data.data?.token;
	if (!token) return null;

	tokenCache.set(apiKey, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
	return token;
}

/** Checks an API key is actually valid, for the Settings page's test button and for
 *  validating before saving. */
export async function verifyTvdbKey(apiKey: string): Promise<boolean> {
	try {
		return (await login(apiKey)) !== null;
	} catch {
		return false;
	}
}
