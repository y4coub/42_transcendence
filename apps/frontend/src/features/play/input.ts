/**
 * Keyboard Input Handler
 * 
 * Maps arrow keys to game inputs (up/down/stop)
 * Sends inputs at fixed 60 Hz rate
 * Maintains sequence counter for server-side validation
 * Implements backoff on server errors
 * 
 * Feature: 002-pong-game-integration
 */

export type Direction = 'up' | 'down' | 'stop';
type InputCallback = (direction: Direction, seq: number) => void;

export class InputHandler {
	private currentDirection: Direction = 'stop';
	private sequenceCounter = 0;
	private inputInterval: ReturnType<typeof setInterval> | null = null;
	private inputRate = 60; // Hz
	private callback: InputCallback | null = null;
	private isActive = false;
	private errorBackoff = false;
	private errorBackoffTimeout: ReturnType<typeof setTimeout> | null = null;
	private pressed = new Set<'up' | 'down'>();

	/**
	 * Start listening for keyboard input
	 */
	start(callback: InputCallback): void {
		this.callback = callback;

		if (this.isActive) {
			return;
		}

		this.isActive = true;

		// Add keyboard event listeners
		window.addEventListener('keydown', this.handleKeyDown);
		window.addEventListener('keyup', this.handleKeyUp);
		window.addEventListener('blur', this.handleWindowBlur);
		document.addEventListener('visibilitychange', this.handleVisibilityChange);

		// Start fixed-rate input sending (60 Hz = ~16.67ms)
		this.inputInterval = setInterval(() => {
			this.sendInput();
		}, 1000 / this.inputRate);
	}

	/**
	 * Stop listening for input
	 */
	stop(): void {
		if (!this.isActive) {
			this.callback = null;
			this.currentDirection = 'stop';
			return;
		}

		this.isActive = false;

		// Remove keyboard event listeners
		window.removeEventListener('keydown', this.handleKeyDown);
		window.removeEventListener('keyup', this.handleKeyUp);
		window.removeEventListener('blur', this.handleWindowBlur);
		document.removeEventListener('visibilitychange', this.handleVisibilityChange);

		// Clear input interval
		if (this.inputInterval) {
			clearInterval(this.inputInterval);
			this.inputInterval = null;
		}

		// Clear error backoff timeout
		if (this.errorBackoffTimeout) {
			clearTimeout(this.errorBackoffTimeout);
			this.errorBackoffTimeout = null;
		}

		this.callback = null;
		this.currentDirection = 'stop';
	}

	reset(): void {
		this.sequenceCounter = 0;
		this.currentDirection = 'stop';
		this.pressed.clear();
		if (this.errorBackoffTimeout) {
			clearTimeout(this.errorBackoffTimeout);
			this.errorBackoffTimeout = null;
		}
		this.errorBackoff = false;
	}

	/**
	 * Check if handler is currently active
	 */
	isRunning(): boolean {
		return this.isActive;
	}

	/**
	 * Trigger error backoff (temporarily stop sending inputs)
	 */
	triggerErrorBackoff(durationMs = 1000): void {
		this.errorBackoff = true;

		if (this.errorBackoffTimeout) {
			clearTimeout(this.errorBackoffTimeout);
		}

		this.errorBackoffTimeout = setTimeout(() => {
			this.errorBackoff = false;
			this.errorBackoffTimeout = null;
		}, durationMs);
	}

	/**
	 * Get current input direction
	 */
	getCurrentDirection(): Direction {
		return this.currentDirection;
	}

	/**
	 * Get current sequence number
	 */
	getCurrentSequence(): number {
		return this.sequenceCounter;
	}

	/**
	 * Handle keydown events
	 */
	private handleKeyDown = (event: KeyboardEvent): void => {
		if (!this.isActive) {
			return;
		}

		const normalized = this.normalizeKey(event.key);
		if (!normalized) {
			return;
		}

		event.preventDefault();
		this.pressed.add(normalized);
		this.updateDirectionFromPressed();
	};

	/**
	 * Handle keyup events
	 */
	private handleKeyUp = (event: KeyboardEvent): void => {
		if (!this.isActive) {
			return;
		}

		const normalized = this.normalizeKey(event.key);
		if (!normalized) {
			return;
		}

		event.preventDefault();
		this.pressed.delete(normalized);
		this.updateDirectionFromPressed();
	};

	private handleWindowBlur = (): void => {
		if (!this.isActive) {
			return;
		}

		this.pressed.clear();
		this.currentDirection = 'stop';
	};

	private handleVisibilityChange = (): void => {
		if (!this.isActive || document.visibilityState === 'visible') {
			return;
		}

		this.pressed.clear();
		this.currentDirection = 'stop';
	};

	/**
	 * Send current input to server (called at 60 Hz)
	 */
	private sendInput(): void {
		if (!this.callback || !this.isActive || this.errorBackoff) {
			return;
		}

		this.sequenceCounter++;
		this.callback(this.currentDirection, this.sequenceCounter);
	}

	private normalizeKey(key: string): 'up' | 'down' | null {
		switch (key) {
			case 'ArrowUp':
			case 'w':
			case 'W':
				return 'up';
			case 'ArrowDown':
			case 's':
			case 'S':
				return 'down';
			default:
				return null;
		}
	}

	private updateDirectionFromPressed(): void {
		const up = this.pressed.has('up');
		const down = this.pressed.has('down');
		if (up && !down) {
			this.currentDirection = 'up';
			return;
		}
		if (down && !up) {
			this.currentDirection = 'down';
			return;
		}
		if (!up && !down) {
			this.currentDirection = 'stop';
			return;
		}
		// both pressed: favour last non-stop direction if still held
		if (this.currentDirection === 'up' && up) {
			return;
		}
		if (this.currentDirection === 'down' && down) {
			return;
		}
		this.currentDirection = 'stop';
	}
}
