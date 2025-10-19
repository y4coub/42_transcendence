/**
 * Play Page - Pong Game Controller
 * 
 * Main controller that orchestrates:
 * - Match bootstrap (fetch or create match)
 * - WebSocket connection lifecycle
 * - Game state management and rendering
 * - Input handling
 * - Cleanup on unmount
 * 
 * Feature: 002-pong-game-integration
 * Phase 4: Added ready/pause/resume controls and overlays
 */

import { WSMatchClient } from '../features/play/wsMatchClient';
import { GameStateManager } from '../features/play/state';
import { InputHandler } from '../features/play/input';
import { CanvasGameRenderer } from '../features/play/CanvasGame';
import { GameControls } from '../features/play/Controls';
import { GameOverlay } from '../features/play/Overlay';
import { ChatPanel } from '../features/play/ChatPanel';
import { getAccessToken, getUserId } from '../lib/auth';
import { showError } from '../components/Modal';
import { getUserProfile, createMatch as createPongMatch, getMatch as fetchMatchApi, getMatchChat, type MatchData } from '../lib/api-client';
import { updatePlayerInfo, updateMatchMeta } from './game';

export class PlayPage {
	private matchId: string | null = null;
	private wsClient: WSMatchClient | null = null;
	private stateManager: GameStateManager;
	private inputHandler: InputHandler;
	private renderer: CanvasGameRenderer | null = null;
private controls: GameControls | null = null;
private overlay: GameOverlay | null = null;
private chatPanel: ChatPanel | null = null;
private userId: string | null = null;
private token: string | null = null;
private p1Id: string | null = null;
private p2Id: string | null = null;
private currentState: string = 'waiting';
private latency = 0;
private isCleanedUp = false;
private botGameActive = false;
private uiInitialized = false;
private autoReady = false;
private readyRetryTimer: number | null = null;
private readyKeepAlive: number | null = null;
private practiceHandlers: {
	canvas: HTMLCanvasElement;
	mouseMove: (event: MouseEvent) => void;
	keyDown: (event: KeyboardEvent) => void;
	keyUp: (event: KeyboardEvent) => void;
} | null = null;

	constructor() {
		this.stateManager = new GameStateManager();
		this.inputHandler = new InputHandler();
	}

	/**
	 * Ensure renderer, controls, and overlay are ready
	 */
	private initializeUiComponents(): void {
		if (this.uiInitialized) {
			return;
		}

		const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
		if (!canvas) {
			throw new Error('Canvas element not found');
		}

		this.renderer = new CanvasGameRenderer(canvas);
		if (this.userId) {
			this.renderer.setOptions({ playerId: this.userId });
		}
		this.renderer.showPlaceholder('Initializing arena...');
		this.renderer.start();

	this.controls = new GameControls('game-controls', {
		onReady: () => {
			if (!this.wsClient) {
				console.log('[PlayPage] Ready clicked during practice mode');
				this.overlay?.show({ type: 'waiting', message: 'Practice mode active. We will connect you once a match is available.' });
				setTimeout(() => this.overlay?.hide(), 2000);
				return;
			}
			console.log('[PlayPage] Ready button clicked');
			this.triggerReady();
		},
			onPause: () => {
				if (!this.wsClient) {
					return;
				}
				console.log('[PlayPage] Pause button clicked');
				this.wsClient.sendPause();
			},
			onResume: () => {
				if (!this.wsClient) {
					return;
				}
				console.log('[PlayPage] Resume button clicked');
				this.wsClient.sendResume();
			},
			onForfeit: () => {
				if (!this.wsClient) {
					this.stopBotGame();
					this.startPracticeMode();
					return;
				}
				console.log('[PlayPage] Forfeit button clicked');
				this.wsClient.leaveMatch();
				this.cleanup();
			},
		});

	this.overlay = new GameOverlay('game-overlay');
	this.uiInitialized = true;
}

private clearReadyRetryTimer(): void {
	if (this.readyRetryTimer !== null) {
		window.clearTimeout(this.readyRetryTimer);
		this.readyRetryTimer = null;
	}
}

private clearReadyKeepAlive(): void {
	if (this.readyKeepAlive !== null) {
		window.clearInterval(this.readyKeepAlive);
		this.readyKeepAlive = null;
	}
}

private scheduleReadyRetry(): void {
	this.clearReadyRetryTimer();
	this.readyRetryTimer = window.setTimeout(() => {
		if (this.currentState === 'waiting') {
			console.warn('[PlayPage] Ready acknowledgement timeout - re-enable button');
			this.controls?.setState({ gameState: 'waiting', isUserPauser: false, ready: false });
			this.overlay?.show({ type: 'waiting', message: 'Still waiting for the opponent. Click Ready again if needed.' });
		}
	}, 5000);
}

private triggerReady(auto = false): void {
	if (!this.wsClient) {
		return;
	}

	this.wsClient.sendReady();
	this.controls?.setState({ gameState: 'waiting', isUserPauser: false, ready: true });
	this.overlay?.show({ type: 'waiting', message: auto ? 'Waiting for opponent to respond...' : 'Waiting for opponent to be ready...' });
	this.scheduleReadyRetry();
	this.clearReadyKeepAlive();
	this.readyKeepAlive = window.setInterval(() => {
		if (this.currentState === 'waiting') {
			console.log('[PlayPage] Resending ready state keep-alive');
			this.wsClient?.sendReady();
		} else {
			this.clearReadyKeepAlive();
		}
	}, 3000);
}

	/**
	 * Enter solo practice mode (no matchmaking context)
	 */
private startPracticeMode(): void {
	this.stopBotGame();
	this.clearReadyRetryTimer();
	this.clearReadyKeepAlive();

		this.currentState = 'practice';
		this.p1Name = 'You';
		this.p2Name = 'Practice Bot';
		this.p1Id = this.userId;
		this.p2Id = null;

		updatePlayerInfo(1, this.p1Name, null);
		updatePlayerInfo(2, this.p2Name, null);
		updateMatchMeta('status', 'Practice');
		updateMatchMeta('mode', 'Solo Practice');
		updateMatchMeta('round', 'Unlimited');
		updateMatchMeta('latency', 'Offline');

		this.controls?.setState({ gameState: 'practice', isUserPauser: false, ready: true });
		this.updateScoreDisplay(0, 0);

		this.overlay?.show({ type: 'waiting', message: 'Practice mode loading...' });
		setTimeout(() => {
			if (this.currentState === 'practice') {
				this.overlay?.hide();
			}
		}, 1200);

		this.startBotGame();
	}

	/**
	 * Initialize the play page
	 * Checks sessionStorage first, then URL params for matchId/opponentId
	 */
	async init(): Promise<void> {
		try {
			this.isCleanedUp = false;
			// Get JWT token from auth library
			this.token = getAccessToken();
			if (!this.token) {
				throw new Error('Not authenticated. Please log in.');
			}

			// Get user ID from auth library
			this.userId = getUserId();
			if (!this.userId) {
				throw new Error('Could not determine user ID from token.');
			}

			// Check sessionStorage first (set by home page when creating match)
			let matchId = sessionStorage.getItem('currentMatchId') || undefined;
			let opponentId = sessionStorage.getItem('currentOpponentId') || undefined;
			this.autoReady = sessionStorage.getItem('matchAutoReady') === '1';
			
			// Fall back to URL params if sessionStorage is empty
			if (!matchId && !opponentId) {
				const urlParams = new URLSearchParams(window.location.search);
				matchId = urlParams.get('matchId') || undefined;
				opponentId = urlParams.get('opponentId') || undefined;
			}
		
			// Clear sessionStorage after reading
			sessionStorage.removeItem('currentMatchId');
			sessionStorage.removeItem('currentOpponentId');
			sessionStorage.removeItem('matchAutoReady');

			// Prepare UI dependencies
			this.initializeUiComponents();
			if (this.userId) {
				this.renderer?.setOptions({ playerId: this.userId });
			}

			// If no match context available, fall back to practice mode
			if (!matchId && !opponentId) {
				console.warn('[PlayPage] No match context found. Entering practice mode.');
				this.startPracticeMode();
				return;
			}

			const match = matchId 
				? await this.fetchMatch(matchId)
				: await this.createMatchSession(opponentId!);

			this.matchId = match.matchId;
			this.p1Id = match.p1Id;
			this.p2Id = match.p2Id;
			this.updateScoreDisplay(match.p1Score ?? 0, match.p2Score ?? 0);

			updateMatchMeta('status', 'Matchmaking');
			updateMatchMeta('mode', 'Ranked');
			updateMatchMeta('round', 'Best of 3');

			// Fetch and display player profiles
			await this.loadPlayerProfiles();

			if (this.renderer) {
				this.renderer.setOptions({
					playerId: this.userId,
					p1Id: this.p1Id,
					p2Id: this.p2Id,
				});
			}

			// Check if opponent has joined
			const opponentJoined = (this.userId === this.p1Id && this.p2Id) || 
			                       (this.userId === this.p2Id && this.p1Id);
		
			if (opponentJoined) {
				this.overlay?.show({ type: 'waiting', message: 'Press Ready when you\'re ready to play' });
			} else {
				this.overlay?.show({ 
					type: 'waiting_opponent',
					onPlayBot: () => this.startBotGame()
				});
			}

			// Connect WebSocket
			await this.connectWebSocket();

			// Join match
			this.wsClient?.joinMatch();

			// Start renderer loop for real-time updates
			this.renderer?.start();

			console.log('[PlayPage] Initialized successfully', { matchId: this.matchId });
		} catch (error) {
			console.error('[PlayPage] Initialization failed:', error);
			this.showError(error instanceof Error ? error.message : 'Failed to initialize game');
			throw error;
		}
	}

	/**
	 * Cleanup resources (called on forfeit or page unload)
	 */
	private cleanup(): void {
		this.clearReadyRetryTimer();
		this.clearReadyKeepAlive();
		if (this.wsClient) {
			this.wsClient.close();
			this.wsClient = null;
		}
		if (this.chatPanel) {
			this.chatPanel.destroy();
			this.chatPanel = null;
		}
		if (this.renderer) {
			this.renderer.stop();
			this.renderer.setState(null);
		}
		this.stateManager.clear();
		// Stop bot game if active
		this.stopBotGame();
		
		this.currentState = 'waiting';
		this.isCleanedUp = true;
		console.log('[PlayPage] Cleanup complete');
	}

	/**
	 * Cleanup when the page is destroyed (called by router)
	 */
	destroy(): void {
		if (!this.isCleanedUp) {
			this.cleanup();
		}
		console.log('[PlayPage] Destroyed');
	}	/**
	 * Fetch existing match from API
	 */
	private async fetchMatch(matchId: string): Promise<MatchData> {
		const data = await fetchMatchApi(matchId);
		return data;
	}

	// Store player names for chat
	private p1Name: string = 'Player 1';
	private p2Name: string = 'Player 2';

	/**
	 * Load and display player profiles
	 */
	private async loadPlayerProfiles(): Promise<void> {
		try {
			// Determine which player is me and which is opponent
			const myPlayerId = this.userId;
			if (!myPlayerId) {
				console.error('[PlayPage] User ID not available');
				return;
			}

			const opponentPlayerId = this.p1Id === myPlayerId ? this.p2Id : this.p1Id;
			const amIPlayer1 = this.p1Id === myPlayerId;

			// Fetch my profile
			const myProfile = await getUserProfile(myPlayerId);
			if (amIPlayer1) {
				this.p1Name = myProfile.displayName;
			} else {
				this.p2Name = myProfile.displayName;
			}
			updatePlayerInfo(
				amIPlayer1 ? 1 : 2,
				myProfile.displayName,
				myProfile.avatarUrl
			);

			// If opponent exists, fetch their profile
			if (opponentPlayerId) {
				const opponentProfile = await getUserProfile(opponentPlayerId);
				if (amIPlayer1) {
					this.p2Name = opponentProfile.displayName;
				} else {
					this.p1Name = opponentProfile.displayName;
				}
				updatePlayerInfo(
					amIPlayer1 ? 2 : 1,
					opponentProfile.displayName,
					opponentProfile.avatarUrl
				);
			}
			// Otherwise opponent info shows "Waiting for opponent..."
		} catch (error) {
			console.error('[PlayPage] Failed to load player profiles:', error);
			// Keep default "Loading..." / "Waiting for opponent..." text
		}
	}

	/**
	 * Create new match via API
	 */
	private async createMatchSession(opponentId: string): Promise<MatchData> {
		const data = await createPongMatch(opponentId);
		return data;
	}

	/**
	 * Connect to WebSocket and setup event handlers
	 */
	private async connectWebSocket(): Promise<void> {
		if (!this.matchId || !this.token) {
			throw new Error('Match ID and token required for WebSocket connection');
		}

		this.wsClient = new WSMatchClient(this.matchId);

		// Setup event handlers
		this.wsClient.onJoined((joined) => {
			console.log('[PlayPage] Joined match:', joined);
			
			// Stop bot game if active
			this.stopBotGame();
			
			// Hide waiting overlay
			this.overlay?.hide();
			updateMatchMeta('status', 'Ready Up');
			updateMatchMeta('latency', 'Measuring...');
			
			// Update controls state to show Ready button
			this.currentState = 'waiting';
			this.controls?.setState({ gameState: 'waiting', isUserPauser: false, ready: false });
			this.clearReadyRetryTimer();
			
			// Resume renderer for live state
			this.renderer?.start();
			
			// Start input handler once joined
			this.inputHandler.start((direction, seq) => {
				this.wsClient?.sendInput(direction, seq);
			});

			if (this.autoReady) {
				console.log('[PlayPage] Auto ready enabled, sending ready signal');
				this.triggerReady(true);
				this.autoReady = false;
			}
		});

		this.wsClient.onState((state) => {
			// Add snapshot to state manager
			this.stateManager.addSnapshot({
				timestamp: state.timestamp,
				ball: state.ball,
				p1: state.p1,
				p2: state.p2,
				score: state.score,
			});

			// Get interpolated state for rendering (slightly behind latest snapshot for smooth interpolation)
			const renderTime = Date.now() - this.stateManager.getRenderDelay();
			const interpolatedState = this.stateManager.getInterpolatedState(renderTime);

			if (interpolatedState && this.renderer) {
				this.renderer.setState(interpolatedState);
				this.renderer.setOptions({ latency: this.latency });
				updateMatchMeta('latency', `${Math.max(0, Math.round(this.latency))} ms`);
			}
			
			// Update score display
			this.updateScoreDisplay(state.score.p1, state.score.p2);
			
			// Update controls state to playing (only on first state message)
			if (this.currentState === 'countdown') {
				this.clearReadyRetryTimer();
				this.clearReadyKeepAlive();
				this.currentState = 'playing';
				this.controls?.setState({ gameState: 'playing', isUserPauser: false, ready: true });
				this.overlay?.hide();
				updateMatchMeta('status', 'Playing');
			}
		});

		this.wsClient.onCountdown((countdown) => {
			const seconds = (countdown as any).seconds ?? (countdown as any).value ?? 0;
			console.log('[PlayPage] Countdown:', seconds);
			this.showCountdown(seconds);
			updateMatchMeta('status', 'Countdown');
			this.clearReadyRetryTimer();
			this.clearReadyKeepAlive();
			
			// Update controls state
			this.currentState = 'countdown';
			this.controls?.setState({ gameState: 'countdown', isUserPauser: false, ready: true });
		});

		this.wsClient.onPaused((paused) => {
			console.log('[PlayPage] Game paused by:', paused.pausedBy);
			this.currentState = 'paused';
			this.inputHandler.stop();
			updateMatchMeta('status', 'Paused');
			this.clearReadyRetryTimer();
			this.clearReadyKeepAlive();
			
			// Update controls state
			const isUserPauser = paused.pausedBy === this.userId;
			this.controls?.setState({ gameState: 'paused', isUserPauser, ready: true });
			
			// Show pause overlay
			const pausedByName =
				paused.pausedBy === this.p1Id ? this.p1Name :
				paused.pausedBy === this.p2Id ? this.p2Name :
				paused.pausedBy;
			this.overlay?.show({ type: 'paused', pausedBy: paused.pausedBy, pausedByName });
		});

		this.wsClient.onResume((resume) => {
			const resumeAt = (resume as any).at ?? Date.now();
			console.log('[PlayPage] Game resuming at:', resumeAt);
			updateMatchMeta('status', 'Countdown');

			// Hide overlay - countdown will show next
			this.overlay?.hide();
		});

		this.wsClient.onGameOver((gameOver) => {
			console.log('[PlayPage] Game over:', gameOver);
			this.currentState = 'ended';
			this.inputHandler.stop();
			this.controls?.setState({ gameState: 'ended', isUserPauser: false, ready: true });
			updateMatchMeta('status', 'Completed');
			updateMatchMeta('latency', '-- ms');
			const finalScore = (gameOver as any).finalScore ?? {
				p1: (gameOver as any).p1Score ?? 0,
				p2: (gameOver as any).p2Score ?? 0,
			};
			const reason = (gameOver as any).reason as string | undefined;
			this.showGameOver(gameOver.winnerId, finalScore, reason);
			this.clearReadyRetryTimer();
			this.clearReadyKeepAlive();
		});

		this.wsClient.onError((error) => {
			console.error('[PlayPage] WebSocket error:', error);
			this.inputHandler.triggerErrorBackoff(1000);
			updateMatchMeta('status', 'Network Issue');
		});

		this.wsClient.onDisconnect(() => {
			console.warn('[PlayPage] WebSocket disconnected');
			this.inputHandler.stop();
			updateMatchMeta('status', 'Disconnected');
		});

		// Connect
		await this.wsClient.connect(this.token);

		// Initialize chat panel (Phase 6: T039)
		await this.initializeChatPanel();

		// Start latency measurement
		this.startLatencyMeasurement();
	}

	/**
	 * Start periodic latency measurement
	 */
	private startLatencyMeasurement(): void {
		setInterval(() => {
			if (this.wsClient?.isConnected()) {
				// The wsClient base class handles ping/pong automatically
				// Latency is calculated from the round-trip time
			}
		}, 5000); // Measure every 5 seconds
	}

	/**
	 * Initialize chat panel (Phase 6: T039)
	 */
	private async initializeChatPanel(): Promise<void> {
		if (!this.matchId || !this.userId || !this.wsClient) {
			console.warn('[PlayPage] Cannot initialize chat - missing requirements');
			return;
		}

		// Find chat container
		const chatContainer = document.getElementById('game-chat');
		if (!chatContainer) {
			console.warn('[PlayPage] Chat container not found in DOM');
			return;
		}

		// Create chat panel
		this.chatPanel = new ChatPanel(this.userId, {
			onSendMessage: (content: string) => {
				this.wsClient?.sendChatMessage(content);
			}
		});

		// Subscribe to incoming chat messages
		this.wsClient.onChatMessage((message) => {
			if (this.chatPanel) {
				this.chatPanel.addMessage({
					id: message.ts, // Use timestamp as ID
					senderId: message.from,
					content: message.body,
					createdAt: message.ts,
					senderName: message.from === this.p1Id ? this.p1Name : this.p2Name
				});
			}
		});

		// Fetch chat history
		try {
			const history = await getMatchChat(this.matchId);
			const messages = history.map((msg) => ({
				...msg,
				senderName: msg.senderId === this.p1Id ? this.p1Name : this.p2Name,
			}));
			this.chatPanel.loadHistory(messages);
			console.log(`[PlayPage] Loaded ${messages.length} chat messages`);
		} catch (error) {
			console.warn('[PlayPage] Failed to fetch chat history:', error);
		}

		// Replace chat container content with panel
		chatContainer.innerHTML = '';
		chatContainer.appendChild(this.chatPanel.getElement());
	}

	/**
	 * Show countdown overlay (uses GameOverlay component)
	 */
	private showCountdown(value: number): void {
		this.overlay?.show({ type: 'countdown', value });
	}

	/**
	 * Update score display in UI
	 */
	private updateScoreDisplay(p1Score: number, p2Score: number): void {
		const matchScoreEl = document.getElementById('match-score');
		const player1ScoreEl = document.getElementById('player1-score');
		const player2ScoreEl = document.getElementById('player2-score');
		
		if (matchScoreEl) {
			matchScoreEl.textContent = `${p1Score} - ${p2Score}`;
		}
		if (player1ScoreEl) {
			player1ScoreEl.textContent = p1Score.toString();
		}
		if (player2ScoreEl) {
			player2ScoreEl.textContent = p2Score.toString();
		}
	}

	/**
	 * Start bot practice game
	 * Allows player to practice while waiting for an opponent
	 * Features:
	 * - Keyboard controls (Arrow Up/Down or W/S)
	 * - Mouse controls (move to follow cursor)
	 * - Simple AI opponent
	 * - Ball physics with paddle/wall collision
	 */
	private startBotGame(): void {
		if (this.botGameActive) {
			return;
		}
		console.log('[PlayPage] Starting bot practice game');
		this.botGameActive = true;
		this.overlay?.hide();
		
		// Show practice mode indicator
		this.overlay?.show({ 
			type: 'waiting', 
			message: '🤖 Practice Mode - Use Arrow Keys or Mouse to Play!' 
		});
		
		// Hide after 3 seconds
		setTimeout(() => {
			if (this.botGameActive) {
				this.overlay?.hide();
			}
		}, 3000);
		
		// Game state (normalized coordinates)
		const paddleHeightNorm = 0.15;
		const paddleWidthNorm = 0.02;
		const ballSizeNorm = 0.02;
		const baseBallSpeed = 0.5; // units per second
		const paddleSpeed = 0.6; // units per second

		let paddle1Y = 0.5;
		let paddle2Y = 0.5;
		let ballX = 0.5;
		let ballY = 0.5;
		let ballVelX = 0;
		let ballVelY = 0;
		let playerScore = 0;
		let botScore = 0;

		const clampPaddle = (y: number) =>
			Math.max(paddleHeightNorm / 2, Math.min(1 - paddleHeightNorm / 2, y));

		const resetBall = (direction?: number) => {
			ballX = 0.5;
			ballY = 0.5;
			const angle = (Math.random() * Math.PI) / 3 - Math.PI / 6;
			const dir = direction ?? (Math.random() > 0.5 ? 1 : -1);
			ballVelX = baseBallSpeed * Math.cos(angle) * dir;
			ballVelY = baseBallSpeed * Math.sin(angle);
		};

		resetBall();
		
		// Keyboard state
		const keys: { [key: string]: boolean } = {};
		
		const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
		if (!canvas) {
			console.warn('[PlayPage] Practice mode aborted - canvas not found');
			this.botGameActive = false;
			return;
		}
		
		this.renderer?.setOptions({
			playerId: this.userId ?? 'practice-local',
			p1Id: this.userId ?? 'practice-local',
			p2Id: 'practice-bot',
		});
		this.renderer?.setState({
			ball: { x: ballX, y: ballY },
			p1: { y: paddle1Y },
			p2: { y: paddle2Y },
			score: { p1: playerScore, p2: botScore },
		});
		
		// Mouse control for player paddle
		let useMouseControl = false;
		const handleMouseMove = (e: MouseEvent) => {
			if (!this.botGameActive) return;
			useMouseControl = true;
			const rect = canvas.getBoundingClientRect();
			const mouseY = e.clientY - rect.top;
			const normalized = mouseY / rect.height;
			paddle1Y = clampPaddle(normalized);
		};
		
		// Keyboard controls
		const handleKeyDown = (e: KeyboardEvent) => {
			if (!this.botGameActive) return;
			if (['ArrowUp', 'ArrowDown', 'w', 's', 'W', 'S'].includes(e.key)) {
				e.preventDefault();
				keys[e.key] = true;
				useMouseControl = false;
			}
		};
		
		const handleKeyUp = (e: KeyboardEvent) => {
			if (!this.botGameActive) return;
			keys[e.key] = false;
		};
		
		// Add event listeners
		canvas.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);
		this.practiceHandlers = { canvas, mouseMove: handleMouseMove, keyDown: handleKeyDown, keyUp: handleKeyUp };
		
		// Update paddle position based on keyboard input
		const updatePlayerPaddle = (deltaTime: number) => {
			if (useMouseControl) return;
			
			if (keys['ArrowUp'] || keys['w'] || keys['W']) {
				paddle1Y = clampPaddle(paddle1Y - paddleSpeed * deltaTime);
			}
			if (keys['ArrowDown'] || keys['s'] || keys['S']) {
				paddle1Y = clampPaddle(paddle1Y + paddleSpeed * deltaTime);
			}
		};
		
		// Reset ball after scoring
		const handleScore = (playerWon: boolean) => {
			if (playerWon) {
				playerScore++;
				resetBall(-1);
			} else {
				botScore++;
				resetBall(1);
			}
			this.updateScoreDisplay(playerScore, botScore);
		};
		
		let lastTimestamp: number | null = null;
		
		const runPracticeFrame = (timestamp: number) => {
			if (!this.botGameActive) {
				return;
			}

			if (lastTimestamp === null) {
				lastTimestamp = timestamp;
				this.practiceFrameId = requestAnimationFrame(runPracticeFrame);
				return;
			}

			const deltaTime = Math.min(0.1, (timestamp - lastTimestamp) / 1000);
			lastTimestamp = timestamp;

			updatePlayerPaddle(deltaTime);

			ballX += ballVelX * deltaTime;
			ballY += ballVelY * deltaTime;

			if (ballY - ballSizeNorm / 2 <= 0) {
				ballY = ballSizeNorm / 2;
				ballVelY = -ballVelY;
			} else if (ballY + ballSizeNorm / 2 >= 1) {
				ballY = 1 - ballSizeNorm / 2;
				ballVelY = -ballVelY;
			}

			const ballLeft = ballX - ballSizeNorm / 2;
			const ballRight = ballX + ballSizeNorm / 2;
			const ballTop = ballY - ballSizeNorm / 2;
			const ballBottom = ballY + ballSizeNorm / 2;

			const p1Right = paddleWidthNorm;
			const p1Top = paddle1Y - paddleHeightNorm / 2;
			const p1Bottom = paddle1Y + paddleHeightNorm / 2;

			if (
				ballLeft <= p1Right &&
				ballRight >= 0 &&
				ballBottom >= p1Top &&
				ballTop <= p1Bottom &&
				ballVelX < 0
			) {
				ballX = p1Right + ballSizeNorm / 2;
				ballVelX = -ballVelX * 1.05;
				const hitPos = (ballY - paddle1Y) / (paddleHeightNorm / 2);
				ballVelY += hitPos * baseBallSpeed * 0.3;
			}

			const p2Left = 1 - paddleWidthNorm;
			const p2Top = paddle2Y - paddleHeightNorm / 2;
			const p2Bottom = paddle2Y + paddleHeightNorm / 2;

			if (
				ballRight >= p2Left &&
				ballLeft <= 1 &&
				ballBottom >= p2Top &&
				ballTop <= p2Bottom &&
				ballVelX > 0
			) {
				ballX = p2Left - ballSizeNorm / 2;
				ballVelX = -ballVelX * 1.05;
				const hitPos = (ballY - paddle2Y) / (paddleHeightNorm / 2);
				ballVelY += hitPos * baseBallSpeed * 0.3;
			}

			if (ballRight < 0) {
				handleScore(false);
			} else if (ballLeft > 1) {
				handleScore(true);
			}

			const botStep = paddleSpeed * 0.55 * deltaTime;
			if (paddle2Y < ballY - 0.02) {
				paddle2Y = clampPaddle(paddle2Y + botStep);
			} else if (paddle2Y > ballY + 0.02) {
				paddle2Y = clampPaddle(paddle2Y - botStep);
			}

			this.renderer?.setState({
				ball: { x: ballX, y: ballY },
				p1: { y: paddle1Y },
				p2: { y: paddle2Y },
				score: { p1: playerScore, p2: botScore },
			});

			this.practiceFrameId = requestAnimationFrame(runPracticeFrame);
		};

		this.practiceFrameId = requestAnimationFrame(runPracticeFrame);
	}

	/**
	 * Stop bot practice game
	 */
	private practiceFrameId: number | null = null;

	private stopBotGame(): void {
		if (!this.botGameActive) {
			return;
		}

		console.log('[PlayPage] Stopping bot practice game');
		this.botGameActive = false;

		if (this.practiceFrameId !== null) {
			cancelAnimationFrame(this.practiceFrameId);
			this.practiceFrameId = null;
		}

		if (this.practiceHandlers) {
			const { canvas, mouseMove, keyDown, keyUp } = this.practiceHandlers;
			canvas.removeEventListener('mousemove', mouseMove);
			window.removeEventListener('keydown', keyDown);
			window.removeEventListener('keyup', keyUp);
			this.practiceHandlers = null;
		}

		this.renderer?.setState(null);
		this.renderer?.showPlaceholder('Practice paused');
		this.overlay?.hide();
	}

	/**
	 * Show game over screen (uses GameOverlay component)
	 */
  private showGameOver(winnerId: string, finalScore: { p1: number; p2: number }, reason?: string): void {
    const winnerName = winnerId === this.p1Id ? this.p1Name : this.p2Name;
    this.updateScoreDisplay(finalScore.p1, finalScore.p2);
    this.overlay?.show({ 
      type: 'game_over', 
      winner: winnerName || 'Unknown',
      score: { p1: finalScore.p1, p2: finalScore.p2 },
      reason,
      onPlayAgain: () => this.handlePlayAgain(),
    });
  }

	private handlePlayAgain(): void {
		console.log('[PlayPage] Play Again triggered');
		try {
			this.wsClient?.leaveMatch();
		} catch (error) {
			console.warn('[PlayPage] Failed to send leaveMatch during Play Again:', error);
		}

		this.cleanup();
		this.matchId = null;
		this.p1Id = null;
		this.p2Id = null;
		this.latency = 0;
		this.currentState = 'practice';
		this.autoReady = false;
		this.isCleanedUp = false;

		this.startPracticeMode();
	}

	/**
	 * Show error message
	 */
	private showError(message: string): void {
		console.error('[PlayPage] Error:', message);
		showError('Game Error', message);
	}
}

// Export singleton instance
export const playPage = new PlayPage();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
	playPage.destroy();
});
