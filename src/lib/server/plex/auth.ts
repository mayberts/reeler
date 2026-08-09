import { getPlexConfig } from './config';

const PLEX_TV = 'https://plex.tv';

function authHeaders() {
	const { clientIdentifier } = getPlexConfig();
	return {
		Accept: 'application/json',
		'X-Plex-Product': 'Reeler',
		'X-Plex-Client-Identifier': clientIdentifier
	};
}

export interface PlexPin {
	id: number;
	code: string;
	authToken: string | null;
}

/** Starts the OAuth PIN flow: creates a pin the user will authorize at plex.tv. */
export async function createPin(): Promise<PlexPin> {
	const response = await fetch(`${PLEX_TV}/api/v2/pins?strong=true`, {
		method: 'POST',
		headers: authHeaders()
	});
	if (!response.ok) {
		throw new Error(`Failed to create Plex pin: ${response.status} ${response.statusText}`);
	}
	return response.json();
}

/** Polls a pin's status. `authToken` is null until the user has approved the login in Plex. */
export async function checkPin(pinId: number): Promise<PlexPin> {
	const response = await fetch(`${PLEX_TV}/api/v2/pins/${pinId}`, {
		headers: authHeaders()
	});
	if (!response.ok) {
		throw new Error(`Failed to check Plex pin: ${response.status} ${response.statusText}`);
	}
	return response.json();
}

/** The URL to send the user's browser to in order to approve the pin. */
export function buildAuthUrl(pin: PlexPin, forwardUrl: string): string {
	const { clientIdentifier } = getPlexConfig();
	const url = new URL('https://app.plex.tv/auth');
	url.hash = `?${new URLSearchParams({
		clientID: clientIdentifier,
		code: pin.code,
		'context[device][product]': 'Reeler',
		forwardUrl
	}).toString()}`;
	return url.toString();
}

export interface PlexUser {
	id: number;
	uuid: string;
	username: string;
	email: string;
	thumb: string;
}

/** Fetches the Plex account tied to a user auth token, once a pin has been approved. */
export async function getPlexUser(authToken: string): Promise<PlexUser> {
	const response = await fetch(`${PLEX_TV}/api/v2/user`, {
		headers: { ...authHeaders(), 'X-Plex-Token': authToken }
	});
	if (!response.ok) {
		throw new Error(`Failed to fetch Plex user: ${response.status} ${response.statusText}`);
	}
	return response.json();
}
