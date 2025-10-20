/**
 * Protected Route Component
 * 
 * Checks for valid JWT token before rendering protected pages
 * Redirects to login if authentication is missing or expired
 * 
 * Feature: 002-pong-game-integration (Phase 5: T030)
 */

import { isAuthenticated, clearAuth, getUserId } from '../lib/auth';

export interface ProtectedRouteProps {
	/** The page component to render if authenticated */
	component: (userId: string) => HTMLElement;
	/** Optional redirect path (default: '/login') */
	redirectTo?: string;
	/** Optional callback when authentication fails */
	onAuthFail?: () => void;
}

/**
 * Create a protected route wrapper
 * 
 * Usage:
 * ```typescript
 * const protectedGame = createProtectedRoute({
 *   component: (userId) => createGamePage(userId),
 *   redirectTo: '/login',
 * });
 * ```
 */
export function createProtectedRoute(props: ProtectedRouteProps): HTMLElement {
	const { component, redirectTo = '/login', onAuthFail } = props;

	// Check authentication
	if (!isAuthenticated()) {
		// Clear stale auth data
		clearAuth();

		// Call optional callback
		if (onAuthFail) {
			onAuthFail();
		}

		// Create redirect element with message
		const container = document.createElement('div');
		container.className = 'flex items-center justify-center min-h-screen bg-gray-900';
		
		const message = document.createElement('div');
		message.className = 'text-center';
		message.innerHTML = `
			<div class="text-xl text-gray-400 mb-4">
				Redirecting to login...
			</div>
			<div class="text-sm text-gray-500">
				Authentication required
			</div>
		`;
		
		container.appendChild(message);

		// Perform redirect after a brief delay
		setTimeout(() => {
			window.location.href = redirectTo;
		}, 500);

		return container;
	}

	// Get user ID from token
	const userId = getUserId();
	if (!userId) {
		// Token exists but can't extract userId - clear and redirect
		clearAuth();
		
		const container = document.createElement('div');
		container.className = 'flex items-center justify-center min-h-screen bg-gray-900';
		
		const message = document.createElement('div');
		message.className = 'text-center text-red-400';
		message.textContent = 'Invalid authentication token';
		
		container.appendChild(message);

		setTimeout(() => {
			window.location.href = redirectTo;
		}, 1000);

		return container;
	}

	// User is authenticated - render the component
	return component(userId);
}

/**
 * Guard function to check authentication before page render
 * Returns true if authenticated, false otherwise
 * 
 * Usage in routing logic:
 * ```typescript
 * if (guardRoute()) {
 *   renderProtectedPage();
 * }
 * ```
 */
export function guardRoute(): boolean {
	if (!isAuthenticated()) {
		clearAuth();
		return false;
	}

	return true;
}

/**
 * Higher-order function to wrap page creators with auth protection
 * 
 * Usage:
 * ```typescript
 * const createProtectedGame = withAuth(createGamePage);
 * ```
 */
export function withAuth<T extends any[]>(
	pageCreator: (...args: T) => HTMLElement
): (...args: T) => HTMLElement {
	return (...args: T): HTMLElement => {
		if (!guardRoute()) {
			// Not authenticated - create redirect element
			const container = document.createElement('div');
			container.className = 'flex items-center justify-center min-h-screen bg-gray-900';
			container.innerHTML = `
				<div class="text-center text-gray-400">
					Redirecting to login...
				</div>
			`;
			
			setTimeout(() => {
				window.location.href = '/login';
			}, 500);

			return container;
		}

		// Authenticated - render page
		return pageCreator(...args);
	};
}
