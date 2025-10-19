#!/usr/bin/env node
/**
 * Smoke Test: WebSocket Reconnection
 * 
 * Tests WebSocket reconnection logic:
 * - Connects to a match
 * - Triggers disconnect
 * - Validates reconnect with exponential backoff
 * - Sends request_state
 * - Validates state response
 * 
 * Feature: 002-pong-game-integration
 */

import WebSocket from 'ws';

export async function run(ctx) {
	const timestamp = Date.now();
	
	// Create test user
	const userEmail = `reconnect+${timestamp}@example.com`;
	const password = 'ReconnectTest!1234';
	
	let userToken = null;
	let userId = null;
	let user2Token = null;
	let user2Id = null;
	let matchId = null;
	
	// Step 1: Register user
	await ctx.step('reconnect', 'register-user', async () => {
		const response = await ctx.request('POST', '/auth/register', {
			body: {
				email: userEmail,
				password,
				displayName: `Reconnect-${timestamp}`,
			},
			expectedStatus: 201,
		});
		
		userToken = response.data.accessToken;
		ctx.assert(userToken, 'User token not received');
		
		// Decode user ID from JWT
		const payload = JSON.parse(Buffer.from(userToken.split('.')[1], 'base64').toString());
		userId = payload.sub || payload.userId || payload.id;
		ctx.assert(userId, 'User ID not found in token');
	});
	
	// Step 2: Create opponent
	await ctx.step('reconnect', 'register-opponent', async () => {
		const response = await ctx.request('POST', '/auth/register', {
			body: {
				email: `opponent+${timestamp}@example.com`,
				password,
				displayName: `Opponent-${timestamp}`,
			},
			expectedStatus: 201,
		});
		
		user2Token = response.data.accessToken;
		const payload = JSON.parse(Buffer.from(user2Token.split('.')[1], 'base64').toString());
		user2Id = payload.sub || payload.userId || payload.id;
	});
	
	// Step 3: Create match
	await ctx.step('reconnect', 'create-match', async () => {
		const response = await ctx.request('POST', '/matches/pong', {
			body: {
				opponentId: user2Id,
			},
			token: userToken,
			expectedStatus: 201,
		});
		
		matchId = response.data.matchId;
		ctx.assert(matchId, 'Match ID not received');
	});
	
	// Step 4: Initial connection
	let ws = null;
	let connectionOkReceived = false;
	let joinedReceived = false;
	let stateReceived = false;
	
	await ctx.step('reconnect', 'initial-connect', async () => {
		const wsUrl = ctx.baseUrl.replace('http://', 'ws://').replace('https://', 'wss://');
		
		ws = new WebSocket(`${wsUrl}/ws/pong/${matchId}?token=${userToken}`);
		
		ws.on('message', (data) => {
			const msg = JSON.parse(data.toString());
			if (msg.type === 'connection_ok') {
				connectionOkReceived = true;
			} else if (msg.type === 'joined') {
				joinedReceived = true;
			} else if (msg.type === 'state') {
				stateReceived = true;
			}
		});
		
		await new Promise((resolve, reject) => {
			ws.once('open', resolve);
			ws.once('error', reject);
			setTimeout(() => reject(new Error('Initial connection timeout')), 5000);
		});
		
		ctx.assert(ws.readyState === WebSocket.OPEN, 'WebSocket not open');
	});
	
	// Step 5: Join match
	await ctx.step('reconnect', 'join-match', async () => {
		ws.send(JSON.stringify({ type: 'join_match', matchId }));
		
		// Wait for joined response
		await new Promise((resolve) => setTimeout(resolve, 500));
		
		ctx.assert(connectionOkReceived, 'connection_ok not received');
		ctx.assert(joinedReceived, 'joined not received');
	});
	
	// Step 6: Trigger disconnect
	await ctx.step('reconnect', 'disconnect', async () => {
		const closePromise = new Promise((resolve) => {
			ws.once('close', resolve);
		});
		
		ws.close();
		
		await closePromise;
		
		ctx.assert(ws.readyState === WebSocket.CLOSED, 'WebSocket not closed');
	});
	
	// Step 7: Reconnect with backoff simulation
	await ctx.step('reconnect', 'reconnect', async () => {
		const wsUrl = ctx.baseUrl.replace('http://', 'ws://').replace('https://', 'wss://');
		
		// Reset flags
		connectionOkReceived = false;
		joinedReceived = false;
		stateReceived = false;
		
		// Simulate exponential backoff (1s wait)
		await new Promise((resolve) => setTimeout(resolve, 1000));
		
		ws = new WebSocket(`${wsUrl}/ws/pong/${matchId}?token=${userToken}`);
		
		ws.on('message', (data) => {
			const msg = JSON.parse(data.toString());
			if (msg.type === 'connection_ok') {
				connectionOkReceived = true;
			} else if (msg.type === 'joined') {
				joinedReceived = true;
			} else if (msg.type === 'state') {
				stateReceived = true;
			}
		});
		
		await new Promise((resolve, reject) => {
			ws.once('open', () => {
				// Send join_match after connecting
				ws.send(JSON.stringify({ type: 'join_match', matchId }));
				// Wait for joined message
				setTimeout(resolve, 500);
			});
			ws.once('error', reject);
			setTimeout(() => reject(new Error('Reconnection timeout')), 5000);
		});
		
		ctx.assert(ws.readyState === WebSocket.OPEN, 'Reconnection failed');
		ctx.assert(connectionOkReceived, 'connection_ok not received on reconnect');
		ctx.assert(joinedReceived, 'joined not received on reconnect');
	});
	
	// Step 8: Request state after reconnection
	await ctx.step('reconnect', 'request-state', async () => {
		ws.send(JSON.stringify({ type: 'request_state', matchId }));
		
		// Wait for state response
		await new Promise((resolve) => setTimeout(resolve, 500));
		
		ctx.assert(stateReceived, 'State not received after request_state');
	});
	
	// Step 9: Validate rejoin
	await ctx.step('reconnect', 'rejoin', async () => {
		// Reset flag
		joinedReceived = false;
		
		ws.send(JSON.stringify({ type: 'join_match', matchId }));
		
		// Wait for joined response
		await new Promise((resolve) => setTimeout(resolve, 500));
		
		ctx.assert(joinedReceived, 'joined not received on rejoin');
	});
	
	// Step 10: Cleanup
	await ctx.step('reconnect', 'cleanup', async () => {
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify({ type: 'leave_match', matchId }));
			ws.close();
		}
		
		await new Promise((resolve) => setTimeout(resolve, 500));
	});
	
	// Print statistics
	console.log('\n📊 Reconnection Statistics:');
	console.log(`  Match ID: ${matchId}`);
	console.log(`  User ID: ${userId}`);
	console.log(`  Reconnection successful: ✓`);
	console.log(`  State recovery successful: ✓`);
	console.log(`  Rejoin successful: ✓`);
}
