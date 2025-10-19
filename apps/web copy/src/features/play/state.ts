/**
 * Game State Manager
 * 
 * Manages game state snapshots and provides interpolation for smooth rendering
 * Implements ring buffer for last 3 snapshots
 * Handles score tracking and pause state
 * 
 * Feature: 002-pong-game-integration
 */

export interface GameSnapshot {
	timestamp: number;
	ball: {
		x: number;
		y: number;
		vx: number;
		vy: number;
	};
	p1: {
		y: number;
	};
	p2: {
		y: number;
	};
	score: {
		p1: number;
		p2: number;
	};
}

export interface InterpolatedState {
	ball: {
		x: number;
		y: number;
	};
	p1: {
		y: number;
	};
	p2: {
		y: number;
	};
	score: {
		p1: number;
		p2: number;
	};
}

export class GameStateManager {
	private snapshots: GameSnapshot[] = [];
	private maxSnapshots = 3;
	private isPaused = false;
	private pauseReason: string | null = null;

	/**
	 * Add a new snapshot from server
	 */
	addSnapshot(snapshot: GameSnapshot): void {
		this.snapshots.push(snapshot);

		// Keep only last 3 snapshots (ring buffer)
		if (this.snapshots.length > this.maxSnapshots) {
			this.snapshots.shift();
		}
	}

	/**
	 * Get interpolated state for current render time
	 * Uses linear interpolation between two closest snapshots
	 */
	getInterpolatedState(renderTime: number): InterpolatedState | null {
		if (this.snapshots.length === 0) {
			return null;
		}

		// If we only have one snapshot, return it as-is
		if (this.snapshots.length === 1) {
			const snap = this.snapshots[0];
			return {
				ball: { x: snap.ball.x, y: snap.ball.y },
				p1: { y: snap.p1.y },
				p2: { y: snap.p2.y },
				score: snap.score,
			};
		}

		// Find two snapshots to interpolate between
		// We want: snapshot1.timestamp <= renderTime <= snapshot2.timestamp
		let snapshot1: GameSnapshot | null = null;
		let snapshot2: GameSnapshot | null = null;

		for (let i = 0; i < this.snapshots.length - 1; i++) {
			if (
				this.snapshots[i].timestamp <= renderTime &&
				this.snapshots[i + 1].timestamp >= renderTime
			) {
				snapshot1 = this.snapshots[i];
				snapshot2 = this.snapshots[i + 1];
				break;
			}
		}

		// If we couldn't find a pair, use the last snapshot
		if (!snapshot1 || !snapshot2) {
			const latest = this.snapshots[this.snapshots.length - 1];
			return {
				ball: { x: latest.ball.x, y: latest.ball.y },
				p1: { y: latest.p1.y },
				p2: { y: latest.p2.y },
				score: latest.score,
			};
		}

		// Calculate interpolation factor (0.0 to 1.0)
		const timeDiff = snapshot2.timestamp - snapshot1.timestamp;
		const t = timeDiff > 0 ? (renderTime - snapshot1.timestamp) / timeDiff : 0;

		// Clamp t to [0, 1]
		const clampedT = Math.max(0, Math.min(1, t));

		// Linear interpolation
		return {
			ball: {
				x: this.lerp(snapshot1.ball.x, snapshot2.ball.x, clampedT),
				y: this.lerp(snapshot1.ball.y, snapshot2.ball.y, clampedT),
			},
			p1: {
				y: this.lerp(snapshot1.p1.y, snapshot2.p1.y, clampedT),
			},
			p2: {
				y: this.lerp(snapshot1.p2.y, snapshot2.p2.y, clampedT),
			},
			score: snapshot2.score, // Score doesn't interpolate
		};
	}

	/**
	 * Get latest snapshot
	 */
	getLatestSnapshot(): GameSnapshot | null {
		if (this.snapshots.length === 0) {
			return null;
		}
		return this.snapshots[this.snapshots.length - 1];
	}

	/**
	 * Get current score
	 */
	getScore(): { p1: number; p2: number } | null {
		const latest = this.getLatestSnapshot();
		return latest ? latest.score : null;
	}

	/**
	 * Set pause state
	 */
	setPaused(paused: boolean, reason?: string): void {
		this.isPaused = paused;
		this.pauseReason = reason ?? null;
	}

	/**
	 * Check if game is paused
	 */
	getPaused(): boolean {
		return this.isPaused;
	}

	/**
	 * Get pause reason
	 */
	getPauseReason(): string | null {
		return this.pauseReason;
	}

	/**
	 * Clear all snapshots (for reset)
	 */
	clear(): void {
		this.snapshots = [];
		this.isPaused = false;
		this.pauseReason = null;
	}

	/**
	 * Get number of stored snapshots
	 */
	getSnapshotCount(): number {
		return this.snapshots.length;
	}

	/**
	 * Get interpolation render delay (time behind latest snapshot)
	 * This helps smooth out network jitter
	 */
	getRenderDelay(): number {
		// Render slightly behind latest snapshot to smooth network jitter
		// Matches one server tick at 60 Hz (~16.67ms)
		return Math.round(1000 / 60);
	}

	/**
	 * Linear interpolation helper
	 */
	private lerp(a: number, b: number, t: number): number {
		return a + (b - a) * t;
	}
}
