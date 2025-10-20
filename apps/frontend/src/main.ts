import './styles/globals.css';
import { createNavigation } from './components/navigation';
import { createHomePage } from './pages/home';
import { createGamePage } from './pages/game';
import { playPage } from './pages/play';
import { createProfilePage } from './pages/profile';
import { createChatPage } from './pages/chat';
import { createLoginPage } from './pages/login';
import { appState } from './utils/state';
import { invitationManager } from './features/invitations/InvitationManager';
import { isAuthenticated, getUserId, refreshAccessToken } from './lib/auth';
import { Router, type RouteConfig, type RouteView } from './lib/router';
import { registerRouter, subscribeToRoute } from './lib/router-instance';

const app = document.getElementById('app') as HTMLDivElement | null;
if (!app) {
	throw new Error('Failed to locate #app container');
}

let globalLoadingOverlay: HTMLElement | null = null;

function showGlobalLoading(message: string): void {
	if (!app) {
		return;
	}

	if (globalLoadingOverlay) {
		const messageEl = globalLoadingOverlay.querySelector<HTMLElement>('[data-loading-message]');
		if (messageEl) {
			messageEl.textContent = message;
		}
		return;
	}

	const overlay = document.createElement('div');
	overlay.className =
		'fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-[#05060d]/90 text-[#E0E0E0]';

	const spinner = document.createElement('div');
	spinner.className =
		'h-10 w-10 animate-spin rounded-full border-4 border-[#00C8FF]/60 border-t-transparent';

	const text = document.createElement('div');
	text.className = 'text-xs uppercase tracking-[0.4em] text-[#00C8FF]';
	text.setAttribute('data-loading-message', message);
	text.textContent = message;

	overlay.appendChild(spinner);
	overlay.appendChild(text);

	app.appendChild(overlay);
	globalLoadingOverlay = overlay;
}

function hideGlobalLoading(): void {
	if (!globalLoadingOverlay) {
		return;
	}
	globalLoadingOverlay.remove();
	globalLoadingOverlay = null;
}

interface ViewLifecycle {
	onEnter?: () => void | Promise<void>;
	onLeave?: () => void | Promise<void>;
}

function createProtectedView(
	contentFactory: () => HTMLElement,
	lifecycle?: ViewLifecycle
): RouteView {
	const root = document.createElement('div');
	return {
		element: root,
		async onEnter() {
			root.innerHTML = '';
			root.appendChild(createNavigation());
			const content = contentFactory();
			root.appendChild(content);
			await lifecycle?.onEnter?.();
		},
		async onLeave() {
			await lifecycle?.onLeave?.();
			root.innerHTML = '';
		},
	};
}

function createPublicView(contentFactory: () => HTMLElement): RouteView {
	const root = document.createElement('div');
	return {
		element: root,
		onEnter() {
			root.innerHTML = '';
			root.appendChild(contentFactory());
		},
		onLeave() {
			root.innerHTML = '';
		},
	};
}

async function requireAuthGuard(): Promise<boolean | string> {
	const hasToken = isAuthenticated();
	let userId = getUserId();

	if (!hasToken || !userId) {
		const refreshed = await refreshAccessToken();
		if (!refreshed) {
			appState.setState({ isLoggedIn: false, userId: undefined, currentPage: 'login' });
			return '/login';
		}
		userId = getUserId();
	}

	if (!userId) {
		appState.setState({ isLoggedIn: false, userId: undefined, currentPage: 'login' });
		return '/login';
	}

	appState.setState({ isLoggedIn: true, userId });
	void invitationManager.init();
	return true;
}

async function redirectIfAuthenticatedGuard(): Promise<boolean | string> {
	const hasToken = isAuthenticated();
	let userId = getUserId();

	if (!hasToken || !userId) {
		const refreshed = await refreshAccessToken();
		if (refreshed) {
			userId = getUserId();
		}
	}

	if (userId) {
		appState.setState({ isLoggedIn: true, userId });
		void invitationManager.init();
		return '/home';
	}

	appState.setState({ isLoggedIn: false, userId: undefined });
	return true;
}

const protectedRoutes: RouteConfig[] = [
	{
		id: 'home',
		path: '/',
		createView: () => createProtectedView(createHomePage),
		canActivate: requireAuthGuard,
	},
	{
		id: 'home',
		path: '/home',
		createView: () => createProtectedView(createHomePage),
		canActivate: requireAuthGuard,
	},
	{
		id: 'game',
		path: '/arena',
		createView: () =>
			createProtectedView(createGamePage, {
				onEnter: () =>
					playPage.init().catch((error) => {
						console.error('[Main] Failed to initialize game:', error);
					}),
				onLeave: () => {
					playPage.destroy();
				},
			}),
		canActivate: requireAuthGuard,
	},
	{
		id: 'profile',
		path: '/profile',
		createView: () => createProtectedView(createProfilePage),
		canActivate: requireAuthGuard,
	},
	{
		id: 'chat',
		path: '/chat',
		createView: () => createProtectedView(createChatPage),
		canActivate: requireAuthGuard,
	},
];

const publicRoutes: RouteConfig[] = [
	{
		id: 'login',
		path: '/login',
		createView: () => createPublicView(createLoginPage),
		canActivate: redirectIfAuthenticatedGuard,
	},
];

const router = new Router(app, [...protectedRoutes, ...publicRoutes]);
registerRouter(router);

subscribeToRoute((match) => {
	app.dataset.currentPage = match.id;
	appState.setState({ currentPage: match.id });
});

void bootstrap();

async function bootstrap(): Promise<void> {
	await initializeAuth();
	router.start();
}

async function initializeAuth(): Promise<void> {
	const urlParams = new URLSearchParams(window.location.search);
	const isOAuthCallback = urlParams.has('code') && urlParams.has('state');

	if (isOAuthCallback) {
		showGlobalLoading('Completing OAuth sign-in…');
		try {
			const code = urlParams.get('code');
			const state = urlParams.get('state');

			const apiUrl =
				window.location.hostname === 'localhost'
					? 'http://localhost:3000'
					: `https://${window.location.hostname}`;

			const response = await fetch(`${apiUrl}/auth/42/callback?code=${code}&state=${state}`, {
				method: 'GET',
				headers: { 'Content-Type': 'application/json' },
			});

			if (!response.ok) {
				throw new Error('OAuth authentication failed');
			}

			const data = await response.json();

			if (data.type === 'challenge' && data.challengeId) {
				sessionStorage.setItem(
					'oauth42Challenge',
					JSON.stringify({
						challengeId: data.challengeId,
						challengeToken: data.challengeToken,
					})
				);

				window.history.replaceState({ path: '/login' }, '', '/login');
				appState.setState({ isLoggedIn: false, userId: undefined, currentPage: 'login' });
			} else if (data.accessToken) {
				const { setAuthTokens, getUserId: readUserId } = await import('./lib/auth');
				setAuthTokens(data.accessToken, data.refreshToken);
				const userId = readUserId();

				appState.setState({
					isLoggedIn: true,
					userId: userId ?? undefined,
					currentPage: 'home',
				});
				void invitationManager.init();
				window.history.replaceState({ path: '/home' }, '', '/home');
			}
		} catch (error) {
			console.error('OAuth callback error:', error);
			window.history.replaceState({ path: '/login' }, '', '/login');
			appState.setState({ isLoggedIn: false, userId: undefined, currentPage: 'login' });
		} finally {
			hideGlobalLoading();
		}
		return;
	}

	const hasValidToken = isAuthenticated();
	const userId = getUserId();

	if (hasValidToken && userId) {
		appState.setState({ isLoggedIn: true, userId });
		void invitationManager.init();
	} else {
		const refreshed = await refreshAccessToken();
		if (refreshed) {
			const refreshedUserId = getUserId();
			if (refreshedUserId) {
				appState.setState({ isLoggedIn: true, userId: refreshedUserId });
				void invitationManager.init();
				return;
			}
		}
		appState.setState({ isLoggedIn: false, userId: undefined, currentPage: 'login' });
	}
}
