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

type Direction = 'up' | 'down' | 'stop';
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

	/**
	 * Start listening for keyboard input
	 */
	start(callback: InputCallback): void {
		this.callback = callback;
		this.isActive = true;
		this.sequenceCounter = 0;
		this.currentDirection = 'stop';

		// Add keyboard event listeners
		window.addEventListener('keydown', this.handleKeyDown);
		window.addEventListener('keyup', this.handleKeyUp);

		// Start fixed-rate input sending (60 Hz = ~16.67ms)
		this.inputInterval = setInterval(() => {
			this.sendInput();
		}, 1000 / this.inputRate);
	}

	/**
	 * Stop listening for input
	 */
	stop(): void {
		this.isActive = false;

		// Remove keyboard event listeners
		window.removeEventListener('keydown', this.handleKeyDown);
		window.removeEventListener('keyup', this.handleKeyUp);

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

		switch (event.key) {
			case 'ArrowUp':
			case 'w':
			case 'W':
				event.preventDefault();
				this.currentDirection = 'up';
				break;

			case 'ArrowDown':
			case 's':
			case 'S':
				event.preventDefault();
				this.currentDirection = 'down';
				break;
		}
	};

	/**
	 * Handle keyup events
	 */
	private handleKeyUp = (event: KeyboardEvent): void => {
		if (!this.isActive) {
			return;
		}

		switch (event.key) {
			case 'ArrowUp':
			case 'w':
			case 'W':
			case 'ArrowDown':
			case 's':
			case 'S':
				event.preventDefault();
				this.currentDirection = 'stop';
				break;
		}
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
}
