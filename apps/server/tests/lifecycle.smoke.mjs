#!/usr/bin/env node
/**
 * Smoke Test: Pong Lifecycle (Phase 4)
 * 
 * Tests ready/pause/resume functionality:
 * - Both players must ready before countdown
 * - Pause stops game loop
 * - Only pauser can resume
 * - Countdown before resume
 * 
 * Feature: 002-pong-game-integration
 */

import WebSocket from 'ws';

export async function run(ctx) {
	const timestamp = Date.now();
	const WS_URL = ctx.baseUrl.replace('http', 'ws');
	
	// Create two test users
	const user1Email = `lifecycle1+${timestamp}@example.com`;
	const user2Email = `lifecycle2+${timestamp}@example.com`;
	const password = 'LifecycleTest!1234';
	
	let user1Token = null;
	let user2Token = null;
	let user1Id = null;
	let user2Id = null;
	let matchId = null;
	let ws1 = null;
	let ws2 = null;
	
	try {
		// Step 1: Register user 1
		await ctx.step('pong-lifecycle', 'register-user1', async () => {
			const response = await ctx.request('POST', '/auth/register', {
				body: {
					email: user1Email,
					password,
					displayName: `Lifecycle1-${timestamp}`,
				},
				expectedStatus: 201,
			});
			
			user1Token = response.data.accessToken;
			ctx.assert(user1Token, 'User 1 token not received');
			
			const payload = JSON.parse(Buffer.from(user1Token.split('.')[1], 'base64').toString());
			user1Id = payload.sub || payload.userId || payload.id;
			ctx.assert(user1Id, 'User 1 ID not found in token');
		});
		
		// Step 2: Register user 2
		await ctx.step('pong-lifecycle', 'register-user2', async () => {
			const response = await ctx.request('POST', '/auth/register', {
				body: {
					email: user2Email,
					password,
					displayName: `Lifecycle2-${timestamp}`,
				},
				expectedStatus: 201,
			});
			
			user2Token = response.data.accessToken;
			ctx.assert(user2Token, 'User 2 token not received');
			
			const payload = JSON.parse(Buffer.from(user2Token.split('.')[1], 'base64').toString());
			user2Id = payload.sub || payload.userId || payload.id;
			ctx.assert(user2Id, 'User 2 ID not found in token');
		});
		
		// Step 3: Create match
		await ctx.step('pong-lifecycle', 'create-match', async () => {
			const response = await ctx.request('POST', '/matches/pong', {
				body: {
					opponentId: user2Id,
				},
				token: user1Token,
				expectedStatus: 201,
			});
			
			matchId = response.data.matchId;
			ctx.assert(matchId, 'Match ID not received');
		});
		
		// Step 4: Connect WebSocket clients
		await ctx.step('pong-lifecycle', 'connect-websockets', async () => {
			const wsUrl1 = `${WS_URL}/ws/pong/${matchId}?token=${user1Token}`;
			const wsUrl2 = `${WS_URL}/ws/pong/${matchId}?token=${user2Token}`;
			
			// Connect player 1
			ws1 = await new Promise((resolve, reject) => {
				const ws = new WebSocket(wsUrl1);
				const timeout = setTimeout(() => {
					ws.close();
					reject(new Error('WebSocket 1 connection timeout'));
				}, 5000);
				
				ws.on('open', () => clearTimeout(timeout));
				ws.on('message', (data) => {
					try {
						const message = JSON.parse(data.toString());
						if (message.type === 'connection_ok') {
							clearTimeout(timeout);
							resolve(ws);
						}
					} catch (err) {}
				});
				ws.on('error', (err) => {
					clearTimeout(timeout);
					reject(err);
				});
			});
			
			// Connect player 2
			ws2 = await new Promise((resolve, reject) => {
				const ws = new WebSocket(wsUrl2);
				const timeout = setTimeout(() => {
					ws.close();
					reject(new Error('WebSocket 2 connection timeout'));
				}, 5000);
				
				ws.on('open', () => clearTimeout(timeout));
				ws.on('message', (data) => {
					try {
						const message = JSON.parse(data.toString());
						if (message.type === 'connection_ok') {
							clearTimeout(timeout);
							resolve(ws);
						}
					} catch (err) {}
				});
				ws.on('error', (err) => {
					clearTimeout(timeout);
					reject(err);
				});
			});
			
			ctx.assert(ws1.readyState === WebSocket.OPEN, 'Player 1 WebSocket not connected');
			ctx.assert(ws2.readyState === WebSocket.OPEN, 'Player 2 WebSocket not connected');
		});
		
		// Step 5: Join match (required before ready)
		await ctx.step('pong-lifecycle', 'join-match', async () => {
			let joined1 = false;
			let joined2 = false;
			
			// Setup listeners for joined messages
			const listener1 = (data) => {
				try {
					const message = JSON.parse(data.toString());
					if (message.type === 'joined') {
						joined1 = true;
					}
				} catch (err) {}
			};
			
			const listener2 = (data) => {
				try {
					const message = JSON.parse(data.toString());
					if (message.type === 'joined') {
						joined2 = true;
					}
				} catch (err) {}
			};
			
			ws1.on('message', listener1);
			ws2.on('message', listener2);
			
			// Send join messages
			ws1.send(JSON.stringify({ type: 'join_match', matchId }));
			ws2.send(JSON.stringify({ type: 'join_match', matchId }));
			
			// Wait for joined responses
			await new Promise(resolve => setTimeout(resolve, 500));
			
			ws1.off('message', listener1);
			ws2.off('message', listener2);
			
			ctx.assert(joined1, 'Player 1 not joined');
			ctx.assert(joined2, 'Player 2 not joined');
		});
		
		// Step 6: Player 1 ready (should NOT start countdown yet)
		await ctx.step('pong-lifecycle', 'player1-ready', async () => {
			let countdownReceived = false;
			
			// Monitor for countdown message (shouldn't happen)
			const countdownListener = (data) => {
				try {
					const message = JSON.parse(data.toString());
					if (message.type === 'countdown') {
						countdownReceived = true;
					}
				} catch (err) {}
			};
			
			ws1.on('message', countdownListener);
			ws2.on('message', countdownListener);
			
			// Send ready
			ws1.send(JSON.stringify({ type: 'ready', matchId }));
			
			// Wait a bit
			await new Promise(resolve => setTimeout(resolve, 1000));
			
			ws1.off('message', countdownListener);
			ws2.off('message', countdownListener);
			
			ctx.assert(!countdownReceived, 'Countdown should NOT start with only one player ready');
		});
		
		// Step 7: Player 2 ready (should trigger countdown)
		await ctx.step('pong-lifecycle', 'player2-ready-countdown', async () => {
			let countdownReceived = false;
			
			const countdownPromise = new Promise((resolve) => {
				const listener = (data) => {
					try {
						const message = JSON.parse(data.toString());
						if (message.type === 'countdown') {
							countdownReceived = true;
							ws1.off('message', listener);
							resolve();
						}
					} catch (err) {}
				};
				ws1.on('message', listener);
				setTimeout(() => resolve(), 5000);
			});
			
			// Send ready
			ws2.send(JSON.stringify({ type: 'ready', matchId }));
			
			await countdownPromise;
			ctx.assert(countdownReceived, 'Countdown should start when both players ready');
			
			// Wait for game to start
			await new Promise(resolve => setTimeout(resolve, 4000));
		});
		
		// Step 8: Pause game
		await ctx.step('pong-lifecycle', 'pause-game', async () => {
			let pausedReceived = false;
			
			const pausePromise = new Promise((resolve) => {
				const listener = (data) => {
					try {
						const message = JSON.parse(data.toString());
						if (message.type === 'paused') {
							pausedReceived = true;
							ws1.off('message', listener);
							resolve();
						}
					} catch (err) {}
				};
				ws1.on('message', listener);
				setTimeout(() => resolve(), 3000);
			});
			
			// Player 1 pauses
			ws1.send(JSON.stringify({ type: 'pause', matchId }));
			
			await pausePromise;
			ctx.assert(pausedReceived, 'Paused message should be received');
		});
		
		// Step 9: Try resume from non-pauser (should fail)
		await ctx.step('pong-lifecycle', 'resume-authorization', async () => {
			let errorReceived = false;
			
			const errorPromise = new Promise((resolve) => {
				const listener = (data) => {
					try {
						const message = JSON.parse(data.toString());
						if (message.type === 'error' && message.code === 'RESUME_FAILED') {
							errorReceived = true;
							ws2.off('message', listener);
							resolve();
						}
					} catch (err) {}
				};
				ws2.on('message', listener);
				setTimeout(() => resolve(), 2000);
			});
			
			// Player 2 tries to resume (should fail)
			ws2.send(JSON.stringify({ type: 'resume', matchId }));
			
			await errorPromise;
			ctx.assert(errorReceived, 'Non-pauser should not be able to resume');
		});
		
		// Step 10: Resume from pauser (should succeed with countdown)
		await ctx.step('pong-lifecycle', 'resume-game', async () => {
			let countdownReceived = false;
			let resumeReceived = false;
			
			const resumePromise = new Promise((resolve) => {
				const listener = (data) => {
					try {
						const message = JSON.parse(data.toString());
						if (message.type === 'countdown') {
							countdownReceived = true;
						}
						if (message.type === 'resume') {
							resumeReceived = true;
							ws1.off('message', listener);
							resolve();
						}
					} catch (err) {}
				};
				ws1.on('message', listener);
				setTimeout(() => resolve(), 5000);
			});
			
			// Player 1 resumes (pauser)
			ws1.send(JSON.stringify({ type: 'resume', matchId }));
			
			await resumePromise;
			ctx.assert(countdownReceived, 'Countdown should happen before resume');
			ctx.assert(resumeReceived, 'Resume message should be received');
		});
		
		// Cleanup
		await ctx.step('pong-lifecycle', 'cleanup', async () => {
			if (ws1) ws1.close();
			if (ws2) ws2.close();
		});
		
	} catch (error) {
		// Cleanup on error
		if (ws1) ws1.close();
		if (ws2) ws2.close();
		throw error;
	}
}
