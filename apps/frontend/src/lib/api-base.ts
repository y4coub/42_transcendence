/**
 * Resolve the API base URL used by the frontend.
 * - honours Vite's VITE_API_URL when provided
 * - falls back to localhost:3000 when running in dev over plain HTTP
 * - otherwise uses the current origin (e.g. when served behind an HTTPS proxy)
 */
export function getApiBaseUrl(): string {
	const envUrl = import.meta.env.VITE_API_URL;

	if (envUrl && typeof envUrl === 'string') {
		try {
			const normalized = new URL(envUrl, window.location.origin);

			// Ensure we do not end up with trailing slashes that break endpoint joins
			normalized.pathname = normalized.pathname.replace(/\/+$/, '');

			return normalized.toString().replace(/\/$/, '');
		} catch (error) {
			console.warn('[api-base] Failed to parse VITE_API_URL, falling back to defaults:', error);
		}
	}

	// Local development: point to the backend dev server
	if (window.location.hostname === 'localhost' && window.location.protocol === 'http:') {
		return 'http://localhost:3000';
	}

	// Default: same origin as the frontend (works for HTTPS deployments)
	return window.location.origin;
}
