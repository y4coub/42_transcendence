/**
 * Pong Game Service
 * 
 * Manages active game instances and their lifecycle
 * Coordinates between WebSocket handlers and physics engine
 * 
 * Feature: 002-pong-game-integration
 */

import type { SocketStream } from '@fastify/websocket';
import type { FastifyBaseLogger } from 'fastify';

import { PongEngine, type GameState } from './engine';
import * as matchRepo from './repository';
import { onMatchCompleted as ladderOnMatchCompleted } from '../ladder/service';

interface PlayerConnection {
	stream: SocketStream;
	playerId: string;
	ready: boolean;
	lastInputSeq: number;
	inputRate: number; // messages per second
	lastInputTime: number;
}

interface ActiveGame {
	matchId: string;
	p1Id: string;
	p2Id: string;
	engine: PongEngine;
	players: Map<string, PlayerConnection>;
	tickInterval: ReturnType<typeof setInterval> | null;
	state: 'waiting' | 'countdown' | 'playing' | 'paused' | 'ended';
	countdownValue: number;
	pausedBy: string | null;
	cleanupTimer: ReturnType<typeof setTimeout> | null;
}

const GAME_TICK_RATE = 60;
const GAME_TICK_INTERVAL_MS = 1000 / GAME_TICK_RATE;

export class PongGameService {
	private games = new Map<string, ActiveGame>();
	private logger: FastifyBaseLogger;

	constructor(logger: FastifyBaseLogger) {
		this.logger = logger;
	}

	/**
	 * Get or create a game instance
	 */
	getOrCreateGame(matchId: string, p1Id: string, p2Id: string): ActiveGame {
		let game = this.games.get(matchId);
		
		if (!game) {
			game = {
				matchId,
				p1Id,
				p2Id,
				engine: new PongEngine({ matchId, winningScore: 5 }),
				players: new Map(),
				tickInterval: null,
				state: 'waiting',
				countdownValue: 3,
				pausedBy: null,
				cleanupTimer: null,
			};
			
			this.games.set(matchId, game);
			this.logger.info({ matchId }, 'Created new game instance');
		}
		
		return game;
	}

	/**
	 * Add a player connection to a game
	 */
	addPlayer(matchId: string, playerId: string, stream: SocketStream): void {
		const game = this.games.get(matchId);
		if (!game) {
			this.logger.warn({ matchId, playerId }, 'Attempted to add player to non-existent game');
			return;
		}

		game.players.set(playerId, {
			stream,
			playerId,
			ready: false,
			lastInputSeq: 0,
			inputRate: 0,
			lastInputTime: Date.now(),
		});

		this.logger.info({ matchId, playerId, playerCount: game.players.size }, 'Player connected to game');
		this.logger.info({ matchId, players: Array.from(game.players.keys()) }, 'Current players in game');

		this.broadcastReadyState(matchId);

		// Phase 4: Both players must ready up before countdown starts
		// No longer auto-start countdown when both players connect
	}

	/**
	 * Remove a player connection from a game
	 */
	removePlayer(matchId: string, playerId: string): void {
		const game = this.games.get(matchId);
		if (!game) {
			return;
		}

		game.players.delete(playerId);
		this.logger.info({ matchId, playerId, playerCount: game.players.size }, 'Player disconnected');

		this.broadcastReadyState(matchId);

		// Stop game if a player disconnects
		if (game.state === 'playing' || game.state === 'countdown') {
			this.stopGame(matchId, 'forfeit');
		}

		// Clean up empty games
		if (game.players.size === 0) {
			this.destroyGame(matchId);
		}
	}

	/**
	 * Handle player ready status
	 */
	setPlayerReady(matchId: string, playerId: string): void {
		const game = this.games.get(matchId);
		if (!game) {
			return;
		}

	const player = game.players.get(playerId);
	if (!player) {
		this.logger.warn({ matchId, playerId }, 'Ready called for player not connected');
		return;
	}

		player.ready = true;
		this.logger.info({
			matchId,
			playerId,
 			playersReady: Array.from(game.players.entries()).map(([id, p]) => ({ playerId: id, ready: p.ready })),
		}, 'Player ready');

		this.broadcastReadyState(matchId);

		// Check if both players ready
		const allReady = Array.from(game.players.values()).every(p => p.ready);
		if (allReady && game.state === 'waiting' && game.players.size === 2) {
			this.startCountdown(matchId);
		} else {
			this.logger.info({
				matchId,
				state: game.state,
				playerCount: game.players.size,
				allReady,
			}, 'Ready check result');
		}
	}

	private broadcastCountdown(matchId: string, seconds: number): void {
		this.logger.info({ matchId, seconds }, 'Broadcasting countdown tick');
		this.broadcast(matchId, {
			type: 'countdown',
			seconds,
		});
	}

	private broadcastReadyState(matchId: string): void {
		const game = this.games.get(matchId);
		if (!game) {
			return;
		}

		const players = Array.from(game.players.values()).map((player) => ({
			playerId: player.playerId,
			ready: player.ready,
		}));

		this.broadcast(matchId, {
			type: 'ready_state',
			matchId,
			players,
			state: game.state,
		});
	}

	/**
	 * Handle player input
	 */
	handleInput(
		matchId: string,
		playerId: string,
		direction: 'up' | 'down' | 'stop',
		seq: number,
		clientTime: number,
	): void {
		const game = this.games.get(matchId);
		if (!game || game.state !== 'playing') {
			return;
		}

		const player = game.players.get(playerId);
		if (!player) {
			return;
		}

		// Validate sequence number (must be monotonically increasing)
		if (seq <= player.lastInputSeq) {
			this.logger.debug({ matchId, playerId, seq, lastSeq: player.lastInputSeq }, 'Out-of-order input ignored');
			return;
		}

		// Rate limiting: max 60 messages per second
		const now = Date.now();
		const timeDiff = now - player.lastInputTime;
		if (timeDiff < 16.67) { // ~60 Hz
			player.inputRate++;
			if (player.inputRate > 60) {
				this.logger.warn({ matchId, playerId, rate: player.inputRate }, 'Input rate limit exceeded');
				return;
			}
		} else {
			player.inputRate = 0;
			player.lastInputTime = now;
		}

		player.lastInputSeq = seq;

		// Apply input to game engine
		game.engine.setPlayerInput(playerId, game.p1Id, game.p2Id, {
			direction,
			seq,
			clientTime,
		});
	}

	/**
	 * Get current game state
	 */
	getGameState(matchId: string): GameState | null {
		const game = this.games.get(matchId);
		if (!game) {
			return null;
		}

		return game.engine.getState();
	}

	forfeitGame(matchId: string, forfeitingPlayerId: string): void {
		const game = this.games.get(matchId);
		if (!game) {
			return;
		}

		this.logger.info({ matchId, forfeitingPlayerId }, 'Processing forfeit');
		this.stopGame(matchId, 'forfeit');
	}

	broadcastMessage(matchId: string, payload: Record<string, unknown>): void {
		this.broadcast(matchId, payload);
	}

	/**
	 * Broadcast message to all players in a game
	 */
	private broadcast(matchId: string, payload: Record<string, unknown>): void {
		const game = this.games.get(matchId);
		if (!game) {
			return;
		}

		const serialized = JSON.stringify(payload);
		
		for (const player of game.players.values()) {
			if (player.stream.socket.readyState === player.stream.socket.OPEN) {
				player.stream.socket.send(serialized);
			}
		}
	}

	/**
	 * Start countdown before game begins
	 */
	private startCountdown(matchId: string): void {
		const game = this.games.get(matchId);
		if (!game || game.state !== 'waiting') {
			return;
		}

		game.state = 'countdown';
		game.countdownValue = 3;

		this.logger.info({ matchId }, 'Starting countdown');

		// Update match state in database
		matchRepo.updateMatchState({
			matchId,
			state: 'countdown',
			startedAt: new Date().toISOString(),
		});

		this.broadcastReadyState(matchId);
		this.broadcastCountdown(matchId, game.countdownValue);

		// Broadcast countdown ticks
		const countdownInterval = setInterval(() => {
			if (!game || game.state !== 'countdown') {
				clearInterval(countdownInterval);
				return;
			}

			game.countdownValue -= 1;

			if (game.countdownValue <= 0) {
				this.broadcastCountdown(matchId, Math.max(game.countdownValue, 0));
				clearInterval(countdownInterval);
				this.startGame(matchId);
				return;
			}

			this.broadcastCountdown(matchId, game.countdownValue);
		}, 1000);
	}

	/**
	 * Start the actual game
	 */
	private startGame(matchId: string): void {
		const game = this.games.get(matchId);
		if (!game) {
			return;
		}

		game.state = 'playing';

		this.logger.info({ matchId }, 'Game started');

		// Update match state in database
		matchRepo.updateMatchState({
			matchId,
			state: 'playing',
		});

		this.broadcastReadyState(matchId);

		// Start game loop (60 Hz tick rate)
		game.tickInterval = setInterval(() => {
			this.gameTick(matchId);
		}, GAME_TICK_INTERVAL_MS);
	}

	/**
	 * Game tick - runs physics and broadcasts state
	 */
	private gameTick(matchId: string): void {
		const game = this.games.get(matchId);
		if (!game || game.state !== 'playing') {
			return;
		}

		// Run physics tick
		const continues = game.engine.tick();

		// Broadcast current state to all players
		const state = game.engine.getState();
		this.broadcast(matchId, {
			type: 'state',
			matchId,
			timestamp: state.timestamp,
			ball: state.ball,
			p1: state.p1,
			p2: state.p2,
			score: state.score,
		});

		// Check if game is over
		if (!continues || game.engine.isGameOver()) {
			this.stopGame(matchId, 'completed');
		}
	}

	/**
	 * Pause the game (T023, T025)
	 */
	pauseGame(matchId: string, playerId: string): boolean {
		const game = this.games.get(matchId);
		if (!game) {
			this.logger.warn({ matchId, playerId }, 'Cannot pause - game not found');
			return false;
		}

		// Only allow pausing during active gameplay
		if (game.state !== 'playing') {
			this.logger.warn({ matchId, playerId, state: game.state }, 'Cannot pause - game not playing');
			return false;
		}

		// Check if player is a participant
		if (playerId !== game.p1Id && playerId !== game.p2Id) {
			this.logger.warn({ matchId, playerId }, 'Cannot pause - not a participant');
			return false;
		}

		// Stop game loop
		if (game.tickInterval) {
			clearInterval(game.tickInterval);
			game.tickInterval = null;
		}

		// Update game state
		game.state = 'paused';
		game.pausedBy = playerId;

		this.logger.info({ matchId, playerId }, 'Game paused');

		// Update database
		matchRepo.updateMatchState({ matchId, state: 'paused' });
		matchRepo.updatePausedBy({ matchId, pausedBy: playerId });

		// Broadcast pause message
		this.broadcast(matchId, {
			type: 'paused',
			matchId,
			pausedBy: playerId,
		});

		return true;
	}

	/**
	 * Resume the game (T023, T024, T025)
	 */
	resumeGame(matchId: string, playerId: string): boolean {
		const game = this.games.get(matchId);
		if (!game) {
			this.logger.warn({ matchId, playerId }, 'Cannot resume - game not found');
			return false;
		}

		// Only allow resuming from paused state
		if (game.state !== 'paused') {
			this.logger.warn({ matchId, playerId, state: game.state }, 'Cannot resume - game not paused');
			return false;
		}

		// Authorization: Only the player who paused can resume
		if (game.pausedBy !== playerId) {
			this.logger.warn({ matchId, playerId, pausedBy: game.pausedBy }, 'Cannot resume - only pauser can resume');
			return false;
		}

		this.logger.info({ matchId, playerId }, 'Resuming game with countdown');

		// Clear pausedBy
		game.pausedBy = null;
		matchRepo.updatePausedBy({ matchId, pausedBy: null });

		// Start countdown before resuming (T024)
		game.state = 'countdown';
		game.countdownValue = 3;

		matchRepo.updateMatchState({ matchId, state: 'countdown' });

		// Broadcast countdown messages
		const countdownInterval = setInterval(() => {
			if (!game || game.state !== 'countdown') {
				clearInterval(countdownInterval);
				return;
			}

			this.broadcast(matchId, {
				type: 'countdown',
				seconds: game.countdownValue,
			});

			game.countdownValue--;

			if (game.countdownValue < 0) {
				clearInterval(countdownInterval);
				
				// Resume the game (transition to playing)
				game.state = 'playing';
				matchRepo.updateMatchState({ matchId, state: 'playing' });

				this.broadcast(matchId, {
					type: 'resume',
					matchId,
					at: Date.now(),
				});

				// Restart game loop
				game.tickInterval = setInterval(() => {
					this.gameTick(matchId);
				}, GAME_TICK_INTERVAL_MS);

				this.logger.info({ matchId }, 'Game resumed');
			}
		}, 1000);

		return true;
	}

	/**
	 * Stop the game
	 */
	private stopGame(matchId: string, reason: 'completed' | 'forfeit'): void {
		const game = this.games.get(matchId);
		if (!game) {
			return;
		}

		// Stop game loop
		if (game.tickInterval) {
			clearInterval(game.tickInterval);
			game.tickInterval = null;
		}

		game.state = 'ended';

		this.logger.info({ matchId, reason }, 'Game ended');

		// Get final state
		const finalState = game.engine.getState();
		let winnerId =
			reason === 'completed'
				? game.engine.getWinnerId(game.p1Id, game.p2Id)
				: game.players.size > 0
				? Array.from(game.players.keys())[0]
				: game.p1Id; // Remaining player wins on forfeit

		if (!winnerId) {
			winnerId = game.p1Id ?? game.p2Id;
		}

		const loserId = winnerId === game.p1Id ? game.p2Id : game.p1Id;

		// Record winner in database
		matchRepo.recordWinner({
			matchId,
			winnerId,
			p1Score: finalState.score.p1,
			p2Score: finalState.score.p2,
		});

		// Update match state
		matchRepo.updateMatchState({
			matchId,
			state: reason === 'completed' ? 'ended' : 'forfeited',
			endedAt: new Date().toISOString(),
		});

		// Broadcast game over
		this.broadcast(matchId, {
			type: 'game_over',
			matchId,
			winnerId,
			finalScore: finalState.score,
			reason: reason === 'completed' ? 'score_limit' : 'forfeit',
		});

		ladderOnMatchCompleted(matchId, winnerId, loserId ?? null);

		// Clean up after a delay to allow post-game flows (rematch requests, etc.)
		if (game.cleanupTimer) {
			clearTimeout(game.cleanupTimer);
		}
		game.cleanupTimer = setTimeout(() => {
			this.destroyGame(matchId);
		}, 30000);
	}

	/**
	 * Destroy a game instance
	 */
	private destroyGame(matchId: string): void {
		const game = this.games.get(matchId);
		if (!game) {
			return;
		}

		if (game.tickInterval) {
			clearInterval(game.tickInterval);
		}
		if (game.cleanupTimer) {
			clearTimeout(game.cleanupTimer);
			game.cleanupTimer = null;
		}
		this.games.delete(matchId);
		this.logger.info({ matchId }, 'Game instance destroyed');
	}
}
