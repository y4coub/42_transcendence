import type { Router, RouteMatch, NavigateOptions } from './router';

let routerInstance: Router | null = null;

export function registerRouter(router: Router): void {
	routerInstance = router;
}

export function getRouter(): Router {
	if (!routerInstance) {
		throw new Error('Router has not been initialised');
	}
	return routerInstance;
}

export function navigate(path: string, options?: NavigateOptions): Promise<void> {
	return getRouter().navigate(path, options);
}

export function getCurrentRoute(): RouteMatch | null {
	return getRouter().getCurrentMatch();
}

export function subscribeToRoute(listener: (match: RouteMatch) => void): () => void {
	return getRouter().subscribe(listener);
}
