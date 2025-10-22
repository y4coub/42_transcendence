/**
 * Authentication utilities for JWT token management
 * 
 * Feature: 002-pong-game-integration (Phase 5: T030-T033)
 */

import { getApiBaseUrl } from './api-base';

const TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_KEY = 'user';

const AUTH_API_BASE = getApiBaseUrl();

let refreshPromise: Promise<boolean> | null = null;

interface TokenPayload {
	sub: string; // userId
	email?: string;
	exp: number; // expiration timestamp
	iat: number; // issued at timestamp
}

/**
 * Store authentication tokens in localStorage
 */
export function setAuthTokens(accessToken: string, refreshToken?: string): void {
	localStorage.setItem(TOKEN_KEY, accessToken);
	if (refreshToken) {
		localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
	}
}

/**
 * Get access token from localStorage
 */
export function getAccessToken(): string | null {
	return localStorage.getItem(TOKEN_KEY);
}

/**
 * Get refresh token from localStorage
 */
export function getRefreshToken(): string | null {
	return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * Clear all auth data from localStorage
 */
export function clearAuth(): void {
	localStorage.removeItem(TOKEN_KEY);
	localStorage.removeItem(REFRESH_TOKEN_KEY);
	localStorage.removeItem(USER_KEY);
}

/**
 * Decode JWT token (without verification - for client-side only)
 * Server will verify the token signature
 */
export function decodeToken(token: string): TokenPayload | null {
	try {
		const parts = token.split('.');
		if (parts.length !== 3) {
			return null;
		}

		const payload = parts[1];
		const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
		return decoded as TokenPayload;
	} catch (error) {
		console.error('Failed to decode token:', error);
		return null;
	}
}

/**
 * Check if token is expired (with 30 second buffer)
 */
export function isTokenExpired(token: string): boolean {
	const decoded = decodeToken(token);
	if (!decoded) {
		return true;
	}

	const now = Math.floor(Date.now() / 1000);
	const buffer = 30; // 30 second buffer before actual expiration
	return decoded.exp < (now + buffer);
}

/**
 * Check if user is authenticated with valid token
 */
export function isAuthenticated(): boolean {
	const token = getAccessToken();
	if (!token) {
		return false;
	}

	return !isTokenExpired(token);
}

/**
 * Get current user ID from token
 */
export function getUserId(): string | null {
	const token = getAccessToken();
	if (!token) {
		return null;
	}

	const decoded = decodeToken(token);
	return decoded?.sub ?? null;
}

/**
 * Store user info in localStorage
 */
export function setUser(user: { id: string; email: string; displayName?: string }): void {
	localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Get user info from localStorage
 */
export function getUser(): { id: string; email: string; displayName?: string } | null {
	const userJson = localStorage.getItem(USER_KEY);
	if (!userJson) {
		return null;
	}

	try {
		return JSON.parse(userJson);
	} catch {
		return null;
	}
}

/**
 * Handle authentication redirect
 * If not authenticated, redirect to login
 * Returns true if authenticated, false if redirected
 */
export function requireAuth(): boolean {
	if (!isAuthenticated()) {
		// Clear any stale data
		clearAuth();
		// Redirect to login
		window.location.href = '/login';
		return false;
	}

	return true;
}

interface RefreshResponse {
	accessToken: string;
	refreshToken?: string;
}

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Returns true if a new token was obtained.
 */
export async function refreshAccessToken(): Promise<boolean> {
	if (refreshPromise) {
		return refreshPromise;
	}

	const refreshToken = getRefreshToken();
	if (!refreshToken) {
		clearAuth();
		return false;
	}

	refreshPromise = (async () => {
		try {
			const response = await fetch(`${AUTH_API_BASE}/auth/token/refresh`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ refreshToken }),
			});

			if (!response.ok) {
				throw new Error(`Refresh failed with status ${response.status}`);
			}

			const data = (await response.json()) as RefreshResponse;
			if (!data?.accessToken) {
				throw new Error('Refresh response missing access token');
			}

			setAuthTokens(data.accessToken, data.refreshToken);
			return true;
		} catch (error) {
			console.error('[Auth] Failed to refresh access token:', error);
			clearAuth();
			return false;
		} finally {
			refreshPromise = null;
		}
	})();

	return refreshPromise;
}
