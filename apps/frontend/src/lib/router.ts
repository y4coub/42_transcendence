/**
 * Simple client-side router inspired by React Router.
 *
 * Provides declarative route configuration, lifecycle hooks, and history
 * integration for vanilla TypeScript applications.
 */

export interface RouteView {
	element: HTMLElement;
	onBeforeEnter?: () => boolean | void | Promise<boolean | void>;
	onEnter?: () => void | Promise<void>;
	onLeave?: () => void | Promise<void>;
}

export interface RouteConfig {
	id: string;
	path: string;
	createView: () => RouteView;
	canActivate?: () => boolean | string | Promise<boolean | string>;
}

export interface RouteMatch {
	id: string;
	path: string;
}

export interface NavigateOptions {
	replace?: boolean;
	force?: boolean;
	skipHistory?: boolean;
}

type RouteListener = (match: RouteMatch) => void;

interface ActiveRoute {
	match: RouteMatch;
	view: RouteView;
}

export class Router {
	private outlet: HTMLElement;
	private routes: RouteConfig[];
	private listeners: RouteListener[] = [];
	private active: ActiveRoute | null = null;

	constructor(outlet: HTMLElement, routes: RouteConfig[]) {
		this.outlet = outlet;
		this.routes = routes;
	}

	start(): void {
		const initialPath = window.location.pathname || '/';

		// Ensure we have history state for the initial load
		if (!window.history.state || window.history.state.path !== initialPath) {
			window.history.replaceState({ path: initialPath }, '', initialPath);
		}

		void this.navigate(initialPath, { replace: true, skipHistory: true, force: true });
		window.addEventListener('popstate', this.handlePopState);
	}

	stop(): void {
		window.removeEventListener('popstate', this.handlePopState);
	}

	async navigate(path: string, options: NavigateOptions = {}): Promise<void> {
		const normalized = this.normalizePath(path);

		if (!options.force && this.active?.match.path === normalized) {
			return;
		}

		const config = this.match(normalized);
		if (!config) {
			console.warn(`[Router] No route found for path "${normalized}", redirecting to "/"`);
			if (normalized !== '/') {
				await this.navigate('/', { replace: true, force: true });
			}
			return;
		}

		const guardResult = await config.canActivate?.();
		if (guardResult === false) {
			return;
		}

		if (typeof guardResult === 'string') {
			await this.navigate(guardResult, { replace: true });
			return;
		}

		const nextMatch: RouteMatch = { id: config.id, path: normalized };

		this.notifyListeners(nextMatch);

		await this.teardownActive();

		let view: RouteView;
		try {
			view = config.createView();
		} catch (error) {
			console.error('[Router] Route view creation failed:', error);
			return;
		}

		const beforeResult = await view.onBeforeEnter?.();
		if (beforeResult === false) {
			await view.onLeave?.();
			return;
		}

		this.outlet.innerHTML = '';
		this.outlet.appendChild(view.element);

		await view.onEnter?.();

		this.active = {
			match: nextMatch,
			view,
		};

		if (!options.skipHistory) {
			const method = options.replace ? 'replaceState' : 'pushState';
			window.history[method]({ path: normalized }, '', normalized);
		}
	}

	getCurrentMatch(): RouteMatch | null {
		return this.active?.match ?? null;
	}

	subscribe(listener: RouteListener): () => void {
		this.listeners.push(listener);
		const current = this.getCurrentMatch();
		if (current) {
			listener(current);
		}
		return () => {
			this.listeners = this.listeners.filter((l) => l !== listener);
		};
	}

	private notifyListeners(match: RouteMatch): void {
		for (const listener of this.listeners) {
			try {
				listener(match);
			} catch (error) {
				console.error('[Router] Listener threw an error:', error);
			}
		}
	}

	private match(path: string): RouteConfig | undefined {
		return this.routes.find((route) => this.normalizePath(route.path) === path);
	}

	private normalizePath(path: string): string {
		if (!path) {
			return '/';
		}
		if (path.length > 1 && path.endsWith('/')) {
			return path.slice(0, -1);
		}
		return path.startsWith('/') ? path : `/${path}`;
	}

	private async teardownActive(): Promise<void> {
		if (!this.active) {
			return;
		}

		try {
			await this.active.view.onLeave?.();
		} catch (error) {
			console.error('[Router] Error during route teardown:', error);
		}

		if (this.active.view.element.isConnected) {
			this.active.view.element.remove();
		}

		this.active = null;
	}

	private handlePopState = (event: PopStateEvent): void => {
		const path = (event.state && event.state.path) || window.location.pathname || '/';
		void this.navigate(path, { replace: true, skipHistory: true, force: true });
	};
}
