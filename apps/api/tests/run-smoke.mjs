#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..', '..');
const defaultEnvPath = path.join(rootDir, '.env.test');
if (existsSync(defaultEnvPath)) {
	dotenv.config({ path: defaultEnvPath, override: false });
}

const localEnvPath = path.resolve(process.cwd(), '.env.test');
if (existsSync(localEnvPath) && localEnvPath !== defaultEnvPath) {
	dotenv.config({ path: localEnvPath, override: false });
}

dotenv.config({ override: false });

const baseUrl = process.env.BASE_URL ?? 'http://localhost:3001';
if (baseUrl.startsWith('https://') && !process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const context = {
	baseUrl,
	env: process.env,
	state: {},
	results: [],
	async step(group, name, fn) {
		const started = performance.now();
		try {
			await fn();
			context.results.push({
				group,
				name,
				status: 'passed',
				durationMs: performance.now() - started,
			});
		} catch (error) {
			context.results.push({
				group,
				name,
				status: 'failed',
				durationMs: performance.now() - started,
				error,
			});
			throw error;
		}
	},
	assert(condition, message) {
		if (!condition) {
			throw new Error(message);
		}
	},
	async request(method, pathname, options = {}) {
		const {
			body,
			token,
			headers: extraHeaders = {},
			expectedStatus,
			skipParse = false,
			query,
		} = options;

		const url = new URL(pathname, baseUrl);
		if (query && typeof query === 'object') {
			for (const [key, value] of Object.entries(query)) {
				if (value === undefined || value === null) {
					continue;
				}
				url.searchParams.set(key, String(value));
			}
		}

		const headers = { ...extraHeaders };
		if (body !== undefined && body !== null && !headers['content-type']) {
			headers['content-type'] = 'application/json';
		}
		if (token) {
			headers.authorization = `Bearer ${token}`;
		}

		const init = {
			method,
			headers,
			body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
		};

		const started = performance.now();
		let response;
		try {
			response = await fetch(url, init);
		} catch (error) {
			throw new Error(`Request to ${url.toString()} failed: ${error instanceof Error ? error.message : String(error)}`);
		}
		const durationMs = performance.now() - started;

		const status = response.status;
		const rawHeaders = Object.fromEntries(response.headers.entries());

		let rawBody = '';
		if (!skipParse && status !== 204 && status !== 304) {
			try {
				rawBody = await response.text();
			} catch (error) {
				throw new Error(`Failed to read response body (${url.toString()}): ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		let data;
		if (!skipParse && rawBody) {
			const contentType = response.headers.get('content-type') ?? '';
			if (contentType.includes('application/json')) {
				try {
					data = JSON.parse(rawBody);
				} catch (error) {
					throw new Error(`Invalid JSON response from ${url.toString()}: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
		}

		if (expectedStatus !== undefined && status !== expectedStatus) {
			throw new Error(
				`Expected status ${expectedStatus} for ${method} ${url.pathname} but received ${status}. Body: ${rawBody}`,
			);
		}

		return {
			status,
			data,
			text: rawBody,
			headers: rawHeaders,
			durationMs,
			url: url.toString(),
		};
	},
	delay,
};

const smokeSuites = [
	{ label: 'auth', file: './auth.smoke.mjs' },
	{ label: 'users', file: './users.smoke.mjs' },
	{ label: 'chat-rest', file: './chat.rest.smoke.mjs' },
	{ label: 'matches-docs', file: './matches_docs.smoke.mjs' },
	{ label: 'chat-ws', file: './chat.ws.smoke.mjs' },
	{ label: 'security', file: './security.smoke.mjs' },
];

const readinessTimeoutMs = 30_000;
const readinessIntervalMs = 1_000;

async function waitForServerReady() {
	const start = performance.now();
	while (performance.now() - start < readinessTimeoutMs) {
		try {
			const response = await context.request('GET', '/healthz', { skipParse: true });
			if (response.status === 200 || response.status === 204) {
				return true;
			}
		} catch (error) {
			// ignore until timeout
		}
		await context.delay(readinessIntervalMs);
	}
	return false;
}

(async () => {
	const isReady = await waitForServerReady();
	if (!isReady) {
		console.error('Backend failed to respond on /healthz within readiness window.');
		process.exit(1);
	}

	let exitCode = 0;
	for (const suite of smokeSuites) {
		const modulePath = new URL(suite.file, import.meta.url).href;
		try {
			const mod = await import(modulePath);
			if (typeof mod.run !== 'function') {
				throw new Error('Smoke module must export a run(context) function.');
			}
			await mod.run(context);
		} catch (error) {
			exitCode = 1;
			console.error(`[${suite.label}] failed:`, error instanceof Error ? error.message : error);
		}
	}

	const summary = context.results.map((result) => {
		const icon = result.status === 'passed' ? '✅' : '❌';
		return `${icon} ${result.group}/${result.name} (${result.durationMs.toFixed(0)}ms)`;
	});

	console.log('\nSmoke summary:');
	for (const line of summary) {
		console.log(line);
	}

	const failed = context.results.filter((result) => result.status === 'failed');
	if (failed.length > 0) {
		console.log(`\nFailures (${failed.length}):`);
		for (const fail of failed) {
			const reason = fail.error instanceof Error ? fail.error.message : String(fail.error);
			console.log(` - ${fail.group}/${fail.name}: ${reason}`);
		}
	}

	process.exit(exitCode);
})();
