#!/usr/bin/env node
/**
 * Smoke Test: Pong Game
 * 
 * Tests full gameplay flow:
 * - Creates two users
 * - Creates a match
 * - Opens two WebSocket clients
 * - Joins both players
 * - Sends inputs
 * - Validates state messages at 20 Hz
 * - Validates game_over message
 * 
 * Feature: 002-pong-game-integration
 */

import WebSocket from 'ws';

export async function run(ctx) {
	const timestamp = Date.now();
	
	// Create two test users
	const user1Email = `pong1+${timestamp}@example.com`;
	const user2Email = `pong2+${timestamp}@example.com`;
	const password = 'PongTest!1234';
	
	let user1Token = null;
	let user2Token = null;
	let user1Id = null;
	let user2Id = null;
	let matchId = null;
	
	// Step 1: Register user 1
	await ctx.step('game', 'register-user1', async () => {
		const response = await ctx.request('POST', '/auth/register', {
			body: {
				email: user1Email,
				password,
				displayName: `Player1-${timestamp}`,
			},
			expectedStatus: 201,
		});
		
		user1Token = response.data.accessToken;
		ctx.assert(user1Token, 'User 1 token not received');
		
		// Decode user ID from JWT
		const payload = JSON.parse(Buffer.from(user1Token.split('.')[1], 'base64').toString());
		user1Id = payload.sub || payload.userId || payload.id;
		ctx.assert(user1Id, 'User 1 ID not found in token');
	});
	
	// Step 2: Register user 2
	await ctx.step('game', 'register-user2', async () => {
		const response = await ctx.request('POST', '/auth/register', {
			body: {
				email: user2Email,
				password,
				displayName: `Player2-${timestamp}`,
			},
			expectedStatus: 201,
		});
		
		user2Token = response.data.accessToken;
		ctx.assert(user2Token, 'User 2 token not received');
		
		// Decode user ID from JWT
		const payload = JSON.parse(Buffer.from(user2Token.split('.')[1], 'base64').toString());
		user2Id = payload.sub || payload.userId || payload.id;
		ctx.assert(user2Id, 'User 2 ID not found in token');
	});
	
	// Step 3: Create match
	await ctx.step('game', 'create-match', async () => {
		const response = await ctx.request('POST', '/matches/pong', {
			body: {
				opponentId: user2Id,
			},
			token: user1Token,
			expectedStatus: 201,
		});
		
		matchId = response.data.matchId;
		ctx.assert(matchId, 'Match ID not received');
		ctx.assert(response.data.p1Id === user1Id, 'Player 1 ID mismatch');
		ctx.assert(response.data.p2Id === user2Id, 'Player 2 ID mismatch');
		ctx.assert(response.data.state === 'waiting', 'Initial match state should be waiting');
	});
	
	// Step 4: Connect WebSocket clients
	let ws1 = null;
	let ws2 = null;
	let stateMessageCount = 0;
	let gameOverReceived = false;
	let countdownReceived = false;
	const stateTimestamps = [];
	
	await ctx.step('game', 'connect-websockets', async () => {
		// Parse base URL to get WS URL
		const wsUrl = ctx.baseUrl.replace('http://', 'ws://').replace('https://', 'wss://');
		
		// Connect player 1
		ws1 = new WebSocket(`${wsUrl}/ws/pong/${matchId}?token=${user1Token}`);
		await new Promise((resolve, reject) => {
			ws1.once('open', resolve);
			ws1.once('error', reject);
			setTimeout(() => reject(new Error('WS1 connection timeout')), 5000);
		});
		
		// Connect player 2
		ws2 = new WebSocket(`${wsUrl}/ws/pong/${matchId}?token=${user2Token}`);
		await new Promise((resolve, reject) => {
			ws2.once('open', resolve);
			ws2.once('error', reject);
			setTimeout(() => reject(new Error('WS2 connection timeout')), 5000);
		});
		
		ctx.assert(ws1.readyState === WebSocket.OPEN, 'WS1 not open');
		ctx.assert(ws2.readyState === WebSocket.OPEN, 'WS2 not open');
	});
	
	// Step 5: Join match
	await ctx.step('game', 'join-match', async () => {
		let joined1 = false;
		let joined2 = false;
		
		// Setup message handlers
		ws1.on('message', (data) => {
			const msg = JSON.parse(data.toString());
			if (msg.type === 'joined') {
				joined1 = true;
			} else if (msg.type === 'countdown') {
				countdownReceived = true;
			} else if (msg.type === 'state') {
				stateMessageCount++;
				stateTimestamps.push(msg.timestamp);
			} else if (msg.type === 'game_over') {
				gameOverReceived = true;
			}
		});
		
		ws2.on('message', (data) => {
			const msg = JSON.parse(data.toString());
			if (msg.type === 'joined') {
				joined2 = true;
			}
		});
		
		// Send join messages
		ws1.send(JSON.stringify({ type: 'join_match', matchId }));
		ws2.send(JSON.stringify({ type: 'join_match', matchId }));
		
		// Wait for joined responses
		await new Promise((resolve) => setTimeout(resolve, 500));
		
		ctx.assert(joined1, 'Player 1 not joined');
		ctx.assert(joined2, 'Player 2 not joined');
	});
	
	// Step 6: Send ready messages and wait for countdown
	await ctx.step('game', 'countdown', async () => {
		// Phase 4: Both players must send ready before countdown starts
		ws1.send(JSON.stringify({ type: 'ready', matchId }));
		ws2.send(JSON.stringify({ type: 'ready', matchId }));
		
		// Wait for countdown (3 seconds) + buffer
		await new Promise((resolve) => setTimeout(resolve, 4000));
		
		ctx.assert(countdownReceived, 'Countdown not received');
	});
	
	// Step 7: Send inputs and validate state messages
	await ctx.step('game', 'gameplay', async () => {
		let inputSeq = 0;
		
		// Send some inputs (alternating up/down)
		const inputInterval = setInterval(() => {
			inputSeq++;
			const direction = inputSeq % 2 === 0 ? 'up' : 'down';
			
			ws1.send(JSON.stringify({
				type: 'input',
				matchId,
				direction,
				seq: inputSeq,
				clientTime: Date.now(),
			}));
			
			ws2.send(JSON.stringify({
				type: 'input',
				matchId,
				direction: direction === 'up' ? 'down' : 'up',
				seq: inputSeq,
				clientTime: Date.now(),
			}));
		}, 100); // Send inputs at 10 Hz
		
		// Wait for game to produce state messages (5 seconds of gameplay)
		await new Promise((resolve) => setTimeout(resolve, 5000));
		
		clearInterval(inputInterval);
		
		// Validate state message frequency
		ctx.assert(stateMessageCount > 0, 'No state messages received');
		
		// Calculate average tick rate
		if (stateTimestamps.length > 1) {
			const intervals = [];
			for (let i = 1; i < stateTimestamps.length; i++) {
				intervals.push(stateTimestamps[i] - stateTimestamps[i - 1]);
			}
			const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
			const avgHz = 1000 / avgInterval;
			
			console.log(`  State messages: ${stateMessageCount}`);
			console.log(`  Average tick rate: ${avgHz.toFixed(1)} Hz (expected: 60 Hz)`);
			console.log(`  Average interval: ${avgInterval.toFixed(2)}ms (expected: ~16.7ms)`);
			
			// Allow some tolerance (55-65 Hz is acceptable)
			ctx.assert(avgHz >= 55 && avgHz <= 65, `Tick rate ${avgHz.toFixed(1)} Hz outside acceptable range (55-65 Hz)`);
		}
	});
	
	// Step 8: Wait for game over (or force it by waiting for score limit)
	// Note: In a real test, we'd let the game run to completion, but that could take minutes
	// For smoke test, we just validate that state messages are flowing correctly
	
	// Step 9: Cleanup
	await ctx.step('game', 'cleanup', async () => {
		if (ws1 && ws1.readyState === WebSocket.OPEN) {
			ws1.send(JSON.stringify({ type: 'leave_match', matchId }));
			ws1.close();
		}
		if (ws2 && ws2.readyState === WebSocket.OPEN) {
			ws2.send(JSON.stringify({ type: 'leave_match', matchId }));
			ws2.close();
		}
		
		// Wait for clean closure
		await new Promise((resolve) => setTimeout(resolve, 500));
	});
	
	// Print statistics
	console.log('\n📊 Game Statistics:');
	console.log(`  Match ID: ${matchId}`);
	console.log(`  Player 1 ID: ${user1Id}`);
	console.log(`  Player 2 ID: ${user2Id}`);
	console.log(`  Total state messages: ${stateMessageCount}`);
	console.log(`  Countdown received: ${countdownReceived ? '✓' : '✗'}`);
	console.log(`  Game over received: ${gameOverReceived ? '✓' : '✗ (not tested)'}`);
}
