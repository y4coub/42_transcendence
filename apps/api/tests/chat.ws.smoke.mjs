import WebSocket from 'ws';

import { ensureSecondaryUser } from './helpers/chat.mjs';

const MESSAGE_TIMEOUT_MS = 3_000;

const toWebSocketUrl = (baseUrl, path) => {
	const url = new URL(path, baseUrl);
	if (url.protocol === 'https:') {
		url.protocol = 'wss:';
	} else if (url.protocol === 'http:') {
		url.protocol = 'ws:';
	}
	return url.toString();
};

const waitForOpen = (socket, timeoutMs = 3_000) => {
	return new Promise((resolve, reject) => {
		const onOpen = () => {
			cleanup();
			resolve();
		};

		const onError = (error) => {
			cleanup();
			reject(error instanceof Error ? error : new Error(String(error)));
		};

		const onTimeout = () => {
			cleanup();
			reject(new Error('Timed out waiting for WebSocket open'));
		};

		const cleanup = () => {
			socket.off('open', onOpen);
			socket.off('error', onError);
			clearTimeout(timer);
		};

		socket.on('open', onOpen);
		socket.on('error', onError);
		const timer = setTimeout(onTimeout, timeoutMs);
		if (typeof timer.unref === 'function') {
			timer.unref();
		}
	});
};

const parsePayload = (data) => {
	if (data === undefined || data === null) {
		return undefined;
	}

	try {
		if (typeof data === 'string') {
			return JSON.parse(data);
		}

		if (Buffer.isBuffer(data)) {
			return JSON.parse(data.toString('utf-8'));
		}

		return JSON.parse(Buffer.from(data).toString('utf-8'));
	} catch {
		return undefined;
	}
};

const waitForMessage = (socket, matcher, timeoutMs = MESSAGE_TIMEOUT_MS) => {
	return new Promise((resolve, reject) => {
		const onMessage = (data) => {
			const payload = parsePayload(data);
			if (!payload) {
				return;
			}

			if (!matcher(payload)) {
				return;
			}

			cleanup();
			resolve(payload);
		};

		const onError = (error) => {
			cleanup();
			reject(error instanceof Error ? error : new Error(String(error)));
		};

		const onTimeout = () => {
			cleanup();
			reject(new Error('Timed out waiting for expected WebSocket message'));
		};

		const cleanup = () => {
			socket.off('message', onMessage);
			socket.off('error', onError);
			clearTimeout(timer);
		};

		socket.on('message', onMessage);
		socket.on('error', onError);
		const timer = setTimeout(onTimeout, timeoutMs);
		if (typeof timer.unref === 'function') {
			timer.unref();
		}
	});
};

const expectNoMessage = (socket, matcher, timeoutMs = 1_000) => {
	return new Promise((resolve, reject) => {
		const onMessage = (data) => {
			const payload = parsePayload(data);
			if (!payload) {
				return;
			}

			if (matcher(payload)) {
				cleanup();
				reject(new Error('Received unexpected WebSocket message'));
			}
		};

		const onError = (error) => {
			cleanup();
			reject(error instanceof Error ? error : new Error(String(error)));
		};

		const onTimeout = () => {
			cleanup();
			resolve();
		};

		const cleanup = () => {
			socket.off('message', onMessage);
			socket.off('error', onError);
			clearTimeout(timer);
		};

		socket.on('message', onMessage);
		socket.on('error', onError);
		const timer = setTimeout(onTimeout, timeoutMs);
		if (typeof timer.unref === 'function') {
			timer.unref();
		}
	});
};

const createSocket = async (ctx, token) => {
	const url = toWebSocketUrl(ctx.baseUrl, '/ws/chat');
	const socket = new WebSocket(url, {
		headers: {
			Authorization: `Bearer ${token}`,
		},
		rejectUnauthorized: false,
	});

	await waitForOpen(socket);
	return socket;
};

const sendJson = (socket, payload) => {
	socket.send(JSON.stringify(payload));
};

export async function run(ctx) {
	ctx.assert(ctx.state.tokens?.access, 'Auth tokens required before running chat WS smoke test');
	const accessToken = ctx.state.tokens.access;

	ctx.state.chat = ctx.state.chat ?? {};
	const fallbackSlug = ctx.state.chat.channel?.slug ?? ctx.env.TEST_CHANNEL ?? 'general';
	ctx.assert(typeof fallbackSlug === 'string', 'Chat channel slug missing');

	await ctx.step('chat-ws', 'connect-primary-socket', async () => {
		ctx.state.chat.ws = ctx.state.chat.ws ?? {};
		ctx.state.chat.ws.primary = await createSocket(ctx, accessToken);
	});

	await ctx.step('chat-ws', 'primary-join-channel', async () => {
		const primary = ctx.state.chat.ws.primary;
		sendJson(primary, { type: 'join', room: fallbackSlug });
		await waitForMessage(primary, (msg) => msg.type === 'joined' && msg.room === fallbackSlug);
	});

	await ctx.step('chat-ws', 'bootstrap-secondary-user', async () => {
		const secondary = await ensureSecondaryUser(ctx);
		ctx.assert(secondary?.tokens?.access, 'Secondary user missing tokens');
		ctx.state.chat.ws.secondaryUser = secondary;
	});

	await ctx.step('chat-ws', 'connect-secondary-socket', async () => {
		const secondaryToken = ctx.state.chat.ws.secondaryUser.tokens.access;
		ctx.state.chat.ws.secondary = await createSocket(ctx, secondaryToken);
	});

	await ctx.step('chat-ws', 'secondary-join-channel', async () => {
		const secondarySocket = ctx.state.chat.ws.secondary;
		sendJson(secondarySocket, { type: 'join', room: fallbackSlug });
		await waitForMessage(secondarySocket, (msg) => msg.type === 'joined' && msg.room === fallbackSlug);
	});

	await ctx.step('chat-ws', 'broadcast-message', async () => {
		const primary = ctx.state.chat.ws.primary;
		const secondary = ctx.state.chat.ws.secondary;
		const message = `WS broadcast ${Date.now()}`;
		sendJson(primary, { type: 'channel', room: fallbackSlug, body: message });

		const [primaryReceipt, secondaryReceipt] = await Promise.all([
			waitForMessage(primary, (msg) => msg.type === 'message' && msg.body === message),
			waitForMessage(secondary, (msg) => msg.type === 'message' && msg.body === message),
		]);

		ctx.assert(primaryReceipt?.room === fallbackSlug, 'Primary did not receive channel echo');
		ctx.assert(secondaryReceipt?.room === fallbackSlug, 'Secondary did not receive channel broadcast');
	});

	await ctx.step('chat-ws', 'block-secondary-user', async () => {
		const primary = ctx.state.chat.ws.primary;
		const secondaryUserId = ctx.state.chat.ws.secondaryUser.user.id;
		sendJson(primary, { type: 'block', userId: secondaryUserId, reason: 'smoke-ws' });
		await waitForMessage(primary, (msg) => msg.type === 'blocked' && msg.userId === secondaryUserId);
	});

	await ctx.step('chat-ws', 'blocked-broadcast-filtered', async () => {
		const primary = ctx.state.chat.ws.primary;
		const secondary = ctx.state.chat.ws.secondary;
		const secondaryUserId = ctx.state.chat.ws.secondaryUser.user.id;
		const message = `WS blocked ${Date.now()}`;
		sendJson(secondary, { type: 'channel', room: fallbackSlug, body: message });

		await waitForMessage(secondary, (msg) => msg.type === 'message' && msg.body === message);
		await expectNoMessage(primary, (msg) => msg.type === 'message' && msg.body === message && msg.from === secondaryUserId);
	});

	await ctx.step('chat-ws', 'cleanup-sockets', async () => {
		const closeSocket = (socket) => {
			if (!socket) {
				return;
			}

			try {
				socket.close();
			} catch {
				// ignore cleanup failures
			}
		};

		closeSocket(ctx.state.chat.ws.primary);
		closeSocket(ctx.state.chat.ws.secondary);
	});
}
