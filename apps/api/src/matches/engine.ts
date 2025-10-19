/**
 * Pong Physics Engine
 * 
 * Server-authoritative game engine that runs at 60 Hz (~16ms tick rate)
 * All coordinates are normalized (0.0-1.0) for resolution independence
 * 
 * Feature: 002-pong-game-integration
 */

export interface GameState {
	matchId: string;
	timestamp: number;
	ball: {
		x: number; // 0.0-1.0
		y: number; // 0.0-1.0
		vx: number; // velocity in normalized units/sec
		vy: number; // velocity in normalized units/sec
	};
	p1: {
		y: number; // 0.0-1.0
	};
	p2: {
		y: number; // 0.0-1.0
	};
	score: {
		p1: number;
		p2: number;
	};
}

export interface PlayerInput {
	direction: 'up' | 'down' | 'stop';
	seq: number;
	clientTime: number;
}

export interface EngineConfig {
	matchId: string;
	winningScore?: number;
	ballSpeed?: number; // normalized units/sec
	paddleSpeed?: number; // normalized units/sec
	paddleHeight?: number; // normalized (0.0-1.0)
	paddleWidth?: number; // normalized (0.0-1.0)
	ballSize?: number; // normalized (0.0-1.0)
}

export class PongEngine {
	private matchId: string;
	private state: GameState;
	private winningScore: number;
	private ballSpeed: number;
	private paddleSpeed: number;
	private paddleHeight: number;
	private paddleWidth: number;
	private ballSize: number;
	private p1Direction: 'up' | 'down' | 'stop' = 'stop';
	private p2Direction: 'up' | 'down' | 'stop' = 'stop';
	private lastTickTime: number;

	constructor(config: EngineConfig) {
		this.matchId = config.matchId;
		this.winningScore = config.winningScore ?? 11;
		this.ballSpeed = config.ballSpeed ?? 0.5; // 50% of screen per second
		this.paddleSpeed = config.paddleSpeed ?? 0.6; // 60% of screen per second
		this.paddleHeight = config.paddleHeight ?? 0.15; // 15% of screen height
		this.paddleWidth = config.paddleWidth ?? 0.02; // 2% of screen width
		this.ballSize = config.ballSize ?? 0.02; // 2% of screen

		// Initialize state
		this.state = {
			matchId: this.matchId,
			timestamp: Date.now(),
			ball: {
				x: 0.5,
				y: 0.5,
				vx: this.ballSpeed * (Math.random() > 0.5 ? 1 : -1),
				vy: this.ballSpeed * (Math.random() * 0.6 - 0.3), // Random angle
			},
			p1: { y: 0.5 },
			p2: { y: 0.5 },
			score: { p1: 0, p2: 0 },
		};

		this.lastTickTime = Date.now();
	}

	/**
	 * Get current game state
	 */
	getState(): GameState {
		return { ...this.state };
	}

	/**
	 * Set player input direction
	 */
	setPlayerInput(playerId: string, matchP1Id: string, matchP2Id: string, input: PlayerInput): void {
		if (playerId === matchP1Id) {
			this.p1Direction = input.direction;
		} else if (playerId === matchP2Id) {
			this.p2Direction = input.direction;
		}
	}

	/**
	 * Physics tick - called every ~16ms (60 Hz)
	 * Returns true if game continues, false if game over
	 */
	tick(): boolean {
		const now = Date.now();
		const deltaTime = (now - this.lastTickTime) / 1000; // Convert to seconds
		this.lastTickTime = now;

		// Update paddle positions
		this.updatePaddles(deltaTime);

		// Update ball position
		this.updateBall(deltaTime);

		// Check collisions
		this.checkWallCollisions();
		this.checkPaddleCollisions();

		// Check scoring
		const scored = this.checkScoring();
		if (scored) {
			// Reset ball to center
			this.resetBall();

			// Check for game over
			if (this.state.score.p1 >= this.winningScore || this.state.score.p2 >= this.winningScore) {
				return false; // Game over
			}
		}

		// Update timestamp
		this.state.timestamp = now;

		return true; // Game continues
	}

	/**
	 * Check if game is over
	 */
	isGameOver(): boolean {
		return this.state.score.p1 >= this.winningScore || this.state.score.p2 >= this.winningScore;
	}

	/**
	 * Get winner ID (call after game over)
	 */
	getWinnerId(matchP1Id: string, matchP2Id: string): string {
		return this.state.score.p1 >= this.winningScore ? matchP1Id : matchP2Id;
	}

	/**
	 * Reset ball to center with random direction
	 */
	resetBall(): void {
		this.state.ball.x = 0.5;
		this.state.ball.y = 0.5;
		
		// Random direction
		const angle = (Math.random() * Math.PI / 3) - Math.PI / 6; // -30° to +30°
		const direction = Math.random() > 0.5 ? 1 : -1;
		
		this.state.ball.vx = this.ballSpeed * Math.cos(angle) * direction;
		this.state.ball.vy = this.ballSpeed * Math.sin(angle);
	}

	// --- Private Methods ---

	private updatePaddles(deltaTime: number): void {
		// Update player 1 paddle
		if (this.p1Direction === 'up') {
			this.state.p1.y = Math.max(this.paddleHeight / 2, this.state.p1.y - this.paddleSpeed * deltaTime);
		} else if (this.p1Direction === 'down') {
			this.state.p1.y = Math.min(1 - this.paddleHeight / 2, this.state.p1.y + this.paddleSpeed * deltaTime);
		}

		// Update player 2 paddle
		if (this.p2Direction === 'up') {
			this.state.p2.y = Math.max(this.paddleHeight / 2, this.state.p2.y - this.paddleSpeed * deltaTime);
		} else if (this.p2Direction === 'down') {
			this.state.p2.y = Math.min(1 - this.paddleHeight / 2, this.state.p2.y + this.paddleSpeed * deltaTime);
		}
	}

	private updateBall(deltaTime: number): void {
		this.state.ball.x += this.state.ball.vx * deltaTime;
		this.state.ball.y += this.state.ball.vy * deltaTime;
	}

	private checkWallCollisions(): void {
		// Top wall
		if (this.state.ball.y - this.ballSize / 2 <= 0) {
			this.state.ball.y = this.ballSize / 2;
			this.state.ball.vy = -this.state.ball.vy;
		}

		// Bottom wall
		if (this.state.ball.y + this.ballSize / 2 >= 1) {
			this.state.ball.y = 1 - this.ballSize / 2;
			this.state.ball.vy = -this.state.ball.vy;
		}
	}

	private checkPaddleCollisions(): void {
		const ballLeft = this.state.ball.x - this.ballSize / 2;
		const ballRight = this.state.ball.x + this.ballSize / 2;
		const ballTop = this.state.ball.y - this.ballSize / 2;
		const ballBottom = this.state.ball.y + this.ballSize / 2;

		// Player 1 paddle (left side)
		const p1PaddleRight = this.paddleWidth;
		const p1PaddleTop = this.state.p1.y - this.paddleHeight / 2;
		const p1PaddleBottom = this.state.p1.y + this.paddleHeight / 2;

		if (
			ballLeft <= p1PaddleRight &&
			ballRight >= 0 &&
			ballBottom >= p1PaddleTop &&
			ballTop <= p1PaddleBottom &&
			this.state.ball.vx < 0 // Moving left
		) {
			// Bounce off player 1 paddle
			this.state.ball.x = p1PaddleRight + this.ballSize / 2;
			this.state.ball.vx = -this.state.ball.vx * 1.05; // Slight speed increase

			// Add spin based on where ball hits paddle
			const hitPosition = (this.state.ball.y - this.state.p1.y) / (this.paddleHeight / 2);
			this.state.ball.vy += hitPosition * this.ballSpeed * 0.3;
		}

		// Player 2 paddle (right side)
		const p2PaddleLeft = 1 - this.paddleWidth;
		const p2PaddleTop = this.state.p2.y - this.paddleHeight / 2;
		const p2PaddleBottom = this.state.p2.y + this.paddleHeight / 2;

		if (
			ballRight >= p2PaddleLeft &&
			ballLeft <= 1 &&
			ballBottom >= p2PaddleTop &&
			ballTop <= p2PaddleBottom &&
			this.state.ball.vx > 0 // Moving right
		) {
			// Bounce off player 2 paddle
			this.state.ball.x = p2PaddleLeft - this.ballSize / 2;
			this.state.ball.vx = -this.state.ball.vx * 1.05; // Slight speed increase

			// Add spin based on where ball hits paddle
			const hitPosition = (this.state.ball.y - this.state.p2.y) / (this.paddleHeight / 2);
			this.state.ball.vy += hitPosition * this.ballSpeed * 0.3;
		}

		// Cap ball velocity to prevent it from getting too fast
		const maxSpeed = this.ballSpeed * 2;
		const currentSpeed = Math.sqrt(this.state.ball.vx ** 2 + this.state.ball.vy ** 2);
		if (currentSpeed > maxSpeed) {
			const scale = maxSpeed / currentSpeed;
			this.state.ball.vx *= scale;
			this.state.ball.vy *= scale;
		}
	}

	private checkScoring(): boolean {
		// Player 2 scores (ball passed left edge)
		if (this.state.ball.x - this.ballSize / 2 <= 0) {
			this.state.score.p2++;
			return true;
		}

		// Player 1 scores (ball passed right edge)
		if (this.state.ball.x + this.ballSize / 2 >= 1) {
			this.state.score.p1++;
			return true;
		}

		return false;
	}
}
