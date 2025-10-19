/**
 * Match-Specific WebSocket Client Wrapper
 * 
 * Provides a typed interface for Pong game WebSocket communication
 * Handles match lifecycle, state updates, and reconnection
 * 
 * Feature: 002-pong-game-integration
 */

import { API_URL } from '../../lib/api-client';
import { WSClient } from '../../lib/ws';
import type {
	JoinMatchMessage,
	LeaveMatchMessage,
	InputMessage,
	ReadyMessage,
	PauseMessage,
	ResumeMessage,
	RequestStateMessage,
	JoinedMessage,
	StateMessage,
	GameOverMessage,
	ErrorMessage,
	CountdownMessage,
	PausedMessage,
	ResumeServerMessage,
} from '../../types/ws-messages';

// Phase 6: Chat message types
export interface MatchChatMessage {
	type: 'match_chat';
	matchId: string;
	from: string;
	body: string;
	ts: string;
}

type StateCallback = (state: StateMessage) => void;
type GameOverCallback = (gameOver: GameOverMessage) => void;
type CountdownCallback = (countdown: CountdownMessage) => void;
type JoinedCallback = (joined: JoinedMessage) => void;
type PausedCallback = (paused: PausedMessage) => void;
type ResumeCallback = (resume: ResumeServerMessage) => void;
type ErrorCallback = (error: ErrorMessage) => void;
type DisconnectCallback = () => void;
type ChatMessageCallback = (message: MatchChatMessage) => void;

export class WSMatchClient {
	private wsClient: WSClient | null = null;
	private matchId: string;
	private stateCallbacks: Set<StateCallback> = new Set();
	private gameOverCallbacks: Set<GameOverCallback> = new Set();
	private countdownCallbacks: Set<CountdownCallback> = new Set();
	private joinedCallbacks: Set<JoinedCallback> = new Set();
	private pausedCallbacks: Set<PausedCallback> = new Set();
	private resumeCallbacks: Set<ResumeCallback> = new Set();
	private errorCallbacks: Set<ErrorCallback> = new Set();
	private disconnectCallbacks: Set<DisconnectCallback> = new Set();
	private chatMessageCallbacks: Set<ChatMessageCallback> = new Set();
	private isJoined = false;
	private pendingJoin = false;

	constructor(matchId: string) {
		this.matchId = matchId;
	}

	/**
	 * Connect to the match WebSocket
	 */
	async connect(token: string): Promise<void> {
		const url = `${this.getWsBaseUrl()}/ws/pong/${this.matchId}`;
		
		this.wsClient = new WSClient({
			url,
			token,
			reconnect: true,
			onOpen: () => {
				console.log('[WSMatchClient] Connected');
				if (this.pendingJoin) {
					this.sendJoin();
					this.pendingJoin = false;
				}
			},
			onClose: (code, reason) => {
				console.log('[WSMatchClient] Disconnected', code, reason);
				this.isJoined = false;
				this.pendingJoin = true;
				this.disconnectCallbacks.forEach(cb => cb());
			},
			onError: (error) => {
				console.error('[WSMatchClient] Error', error);
			},
		});

		this.wsClient.connect();

		// Subscribe to all messages
		this.wsClient.subscribe((message) => {
			this.handleMessage(message);
		});

		// Wait a bit for connection to establish
		await new Promise(resolve => setTimeout(resolve, 100));
	}

	/**
	 * Join the match
	 */
	joinMatch(): void {
		if (!this.wsClient || !this.wsClient.isConnected()) {
			this.pendingJoin = true;
			console.log('[WSMatchClient] Connection not ready, deferring join');
			return;
		}

		this.sendJoin();
	}

	private sendJoin(): void {
		if (!this.wsClient) {
			return;
		}

		const message: JoinMatchMessage = {
			type: 'join_match',
			matchId: this.matchId,
		};

		this.wsClient.send(message);
	}

	/**
	 * Leave the match
	 */
	leaveMatch(): void {
		if (!this.wsClient) {
			return;
		}

		const message: LeaveMatchMessage = {
			type: 'leave_match',
			matchId: this.matchId,
		};

		this.wsClient.send(message);
		this.isJoined = false;
	}

	/**
	 * Send player input
	 */
	sendInput(direction: 'up' | 'down' | 'stop', seq: number): void {
		if (!this.wsClient) {
			console.warn('Cannot send input - not connected');
			return;
		}

		if (!this.isJoined) {
			console.warn('Cannot send input - not joined to match');
			return;
		}

		const message: InputMessage = {
			type: 'input',
			matchId: this.matchId,
			direction,
			seq,
			clientTime: Date.now(),
		};

		this.wsClient.send(message);
	}

	/**
	 * Send ready status
	 */
	sendReady(): void {
		if (!this.wsClient) {
			return;
		}

		const message: ReadyMessage = {
			type: 'ready',
			matchId: this.matchId,
		};

		this.wsClient.send(message);
	}

	/**
	 * Send pause request (T028)
	 */
	sendPause(): void {
		if (!this.wsClient) {
			return;
		}

		const message: PauseMessage = {
			type: 'pause',
			matchId: this.matchId,
		};

		this.wsClient.send(message);
	}

	/**
	 * Send resume request (T028)
	 */
	sendResume(): void {
		if (!this.wsClient) {
			return;
		}

		const message: ResumeMessage = {
			type: 'resume',
			matchId: this.matchId,
		};

		this.wsClient.send(message);
	}

	/**
	 * Request current game state (for reconnection)
	 */
	requestState(): void {
		if (!this.wsClient) {
			return;
		}

		const message: RequestStateMessage = {
			type: 'request_state',
			matchId: this.matchId,
		};

		this.wsClient.send(message);
	}

	/**
	 * Send a chat message (Phase 6: T038)
	 */
	sendChatMessage(content: string): void {
		if (!this.wsClient) {
			console.warn('Cannot send chat - not connected');
			return;
		}

		const message = {
			type: 'match',
			matchId: this.matchId,
			body: content,
		};

		this.wsClient.send(message as any);
	}

	/**
	 * Subscribe to state updates
	 */
	onState(callback: StateCallback): () => void {
		this.stateCallbacks.add(callback);
		return () => this.stateCallbacks.delete(callback);
	}

	/**
	 * Subscribe to game over events
	 */
	onGameOver(callback: GameOverCallback): () => void {
		this.gameOverCallbacks.add(callback);
		return () => this.gameOverCallbacks.delete(callback);
	}

	/**
	 * Subscribe to countdown events
	 */
	onCountdown(callback: CountdownCallback): () => void {
		this.countdownCallbacks.add(callback);
		return () => this.countdownCallbacks.delete(callback);
	}

	/**
	 * Subscribe to joined events
	 */
	onJoined(callback: JoinedCallback): () => void {
		this.joinedCallbacks.add(callback);
		return () => this.joinedCallbacks.delete(callback);
	}

	/**
	 * Subscribe to paused events (T028)
	 */
	onPaused(callback: PausedCallback): () => void {
		this.pausedCallbacks.add(callback);
		return () => this.pausedCallbacks.delete(callback);
	}

	/**
	 * Subscribe to resume events (T028)
	 */
	onResume(callback: ResumeCallback): () => void {
		this.resumeCallbacks.add(callback);
		return () => this.resumeCallbacks.delete(callback);
	}

	/**
	 * Subscribe to error events
	 */
	onError(callback: ErrorCallback): () => void {
		this.errorCallbacks.add(callback);
		return () => this.errorCallbacks.delete(callback);
	}

	/**
	 * Subscribe to disconnect events
	 */
	onDisconnect(callback: DisconnectCallback): () => void {
		this.disconnectCallbacks.add(callback);
		return () => this.disconnectCallbacks.delete(callback);
	}

	/**
	 * Subscribe to chat messages (Phase 6: T038)
	 */
	onChatMessage(callback: ChatMessageCallback): () => void {
		this.chatMessageCallbacks.add(callback);
		return () => this.chatMessageCallbacks.delete(callback);
	}

	/**
	 * Check if connected
	 */
	isConnected(): boolean {
		return this.wsClient?.isConnected() ?? false;
	}

	/**
	 * Check if joined to match
	 */
	hasJoined(): boolean {
		return this.isJoined;
	}

	/**
	 * Close the connection
	 */
	close(): void {
		if (this.wsClient) {
			this.wsClient.close();
		}
		this.isJoined = false;
	}

	/**
	 * Handle incoming messages
	 */
	private handleMessage(message: unknown): void {
		if (!message || typeof message !== 'object') {
			return;
		}

		const msg = message as { type: string };

		switch (msg.type) {
			case 'joined':
				this.isJoined = true;
				this.joinedCallbacks.forEach(cb => cb(msg as JoinedMessage));
				break;

			case 'state':
				this.stateCallbacks.forEach(cb => cb(msg as StateMessage));
				break;

			case 'game_over':
				this.gameOverCallbacks.forEach(cb => cb(msg as GameOverMessage));
				this.isJoined = false;
				break;

			case 'countdown':
				this.countdownCallbacks.forEach(cb => cb(msg as CountdownMessage));
				break;

			case 'paused':
				this.pausedCallbacks.forEach(cb => cb(msg as PausedMessage));
				break;

			case 'resume':
				this.resumeCallbacks.forEach(cb => cb(msg as ResumeServerMessage));
				break;

			case 'match_chat':
				this.chatMessageCallbacks.forEach(cb => cb(msg as MatchChatMessage));
				break;

			case 'left':
				this.isJoined = false;
				break;

			case 'error':
				this.errorCallbacks.forEach(cb => cb(msg as ErrorMessage));
				break;

			case 'connection_ok':
				// Connection established, can now join match
				console.log('WebSocket connection established');
				break;

			case 'pong':
				// Heartbeat response, no action needed
				break;

			default:
				console.warn('Unknown message type:', msg.type);
		}
	}

	/**
	 * Get WebSocket base URL
	 */
	private getWsBaseUrl(): string {
		const apiBase = new URL(API_URL);
		const protocol = apiBase.protocol === 'https:' ? 'wss:' : 'ws:';
		return `${protocol}//${apiBase.host}`;
	}
}
