/**
 * Game Controls Component (T029, T030)
 * 
 * Provides UI controls for:
 * - Ready button (waiting state)
 * - Pause button (playing state)
 * - Resume button (paused state, only if current user is pauser)
 * - Forfeit button (always available)
 * 
 * Feature: 002-pong-game-integration - Phase 4
 */

import { showConfirm } from '../../components/Modal';

export interface ControlsState {
	gameState: 'waiting' | 'countdown' | 'playing' | 'paused' | 'ended' | 'practice';
	isUserPauser: boolean;
	ready: boolean;
}

export interface ControlsCallbacks {
	onReady: () => void;
	onPause: () => void;
	onResume: () => void;
	onForfeit: () => void;
}

export class GameControls {
	private container: HTMLElement;
	private readyButton: HTMLButtonElement;
	private pauseButton: HTMLButtonElement;
	private resumeButton: HTMLButtonElement;
	private forfeitButton: HTMLButtonElement;
	private state: ControlsState;
	private callbacks: ControlsCallbacks;

	constructor(containerId: string, callbacks: ControlsCallbacks) {
		const element = document.getElementById(containerId);
		if (!element) {
			throw new Error(`Container ${containerId} not found`);
		}

		this.container = element;
		this.callbacks = callbacks;
		this.state = {
			gameState: 'waiting',
			isUserPauser: false,
			ready: false,
		};

		// Create buttons
		this.readyButton = this.createButton('Ready', 'ready-btn', () => {
			this.callbacks.onReady();
			this.state.ready = true;
			this.render();
		});

		this.pauseButton = this.createButton('Pause', 'pause-btn', () => {
			this.callbacks.onPause();
		});

		this.resumeButton = this.createButton('Resume', 'resume-btn', () => {
			this.callbacks.onResume();
		});

		this.forfeitButton = this.createButton('Forfeit', 'forfeit-btn', () => {
			showConfirm(
				'Forfeit Match',
				'Are you sure you want to forfeit this match? This will count as a loss.',
				() => {
					this.callbacks.onForfeit();
				}
			);
		});

		this.render();
	}

	/**
	 * Update control state
	 */
	setState(newState: Partial<ControlsState>): void {
		this.state = { ...this.state, ...newState };
		this.render();
	}

	/**
	 * Create a button element
	 */
	private createButton(
		label: string,
		id: string,
		onClick: () => void
	): HTMLButtonElement {
		const button = document.createElement('button');
		button.id = id;
		button.textContent = label;
		button.type = 'button';
		button.className = 'inline-flex items-center justify-center rounded border px-4 py-2 text-sm font-medium uppercase tracking-wide transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00C8FF]';
		button.addEventListener('click', onClick);
		return button;
	}

	private applyButtonStyles(
		button: HTMLButtonElement,
		variant: 'primary' | 'secondary' | 'warning' | 'danger',
		disabled = false
	): void {
		const base =
			'inline-flex items-center justify-center rounded border px-4 py-2 text-sm font-medium uppercase tracking-wide transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00C8FF]';

		const variants: Record<'primary' | 'secondary' | 'warning' | 'danger', string> = {
			primary: 'border-[#00C8FF]/60 bg-[#00C8FF]/20 text-[#E0E0E0] hover:bg-[#00C8FF]/30',
			secondary: 'border-[#00C8FF]/50 bg-[#121425] text-[#00C8FF] hover:bg-[#1a2432]',
			warning: 'border-[#F59E0B]/60 bg-[#1f1506] text-[#F59E0B] hover:bg-[#2a1d0a]',
			danger: 'border-[#FF4D6D]/60 bg-[#200c11] text-[#FF4D6D] hover:bg-[#2b1016]',
		};

		const disabledClasses =
			'cursor-not-allowed border border-[#ffffff12] bg-[#11121a] text-[#6b7280]';

		button.className = `${base} ${disabled ? disabledClasses : variants[variant]}`;
		button.disabled = disabled;
		button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
	}

	/**
	 * Render controls based on current state
	 */
	private render(): void {
		// Clear container
		this.container.innerHTML = '';

		const controlsWrapper = document.createElement('div');
		controlsWrapper.className = 'flex flex-wrap items-center justify-center gap-3 text-sm';
		controlsWrapper.setAttribute('role', 'group');
		controlsWrapper.setAttribute('aria-label', 'Match controls');

		// Practice mode: show restart button only
		if (this.state.gameState === 'practice') {
			this.forfeitButton.textContent = 'Restart Practice';
			this.applyButtonStyles(this.forfeitButton, 'secondary');
			controlsWrapper.appendChild(this.forfeitButton);
			this.container.appendChild(controlsWrapper);
			this.container.dataset.state = this.state.gameState;
			return;
		}

		// Ready button - only show in waiting state
		if (this.state.gameState === 'waiting') {
			this.readyButton.textContent = this.state.ready ? 'Ready Sent' : 'Ready Up';
			this.readyButton.setAttribute('aria-pressed', this.state.ready ? 'true' : 'false');
			this.applyButtonStyles(this.readyButton, 'primary', this.state.ready);
			controlsWrapper.appendChild(this.readyButton);
		}

		// Pause button - only show in playing state
		if (this.state.gameState === 'playing') {
			this.pauseButton.textContent = 'Pause';
			this.applyButtonStyles(this.pauseButton, 'warning');
			controlsWrapper.appendChild(this.pauseButton);
		}

		// Resume button - only show in paused state AND user is pauser
		if (this.state.gameState === 'paused') {
			if (this.state.isUserPauser) {
				this.resumeButton.textContent = 'Resume';
				this.applyButtonStyles(this.resumeButton, 'primary');
				controlsWrapper.appendChild(this.resumeButton);
			} else {
				// Show disabled resume with message
				const disabledMessage = document.createElement('span');
				disabledMessage.textContent = 'Waiting for opponent to resume...';
				disabledMessage.className = 'rounded-xl border border-[#00C8FF]/20 bg-[#10121e]/70 px-4 py-2 text-xs uppercase tracking-[0.3em] text-[#E0E0E0]/60';
				disabledMessage.setAttribute('aria-live', 'polite');
				controlsWrapper.appendChild(disabledMessage);
			}
		}

		// Forfeit button - always available except when ended
		if (this.state.gameState !== 'ended') {
			this.forfeitButton.textContent = this.state.gameState === 'playing' ? 'Forfeit' : 'Leave Match';
			this.applyButtonStyles(this.forfeitButton, 'danger');
			controlsWrapper.appendChild(this.forfeitButton);
		}

		this.container.appendChild(controlsWrapper);
		this.container.dataset.state = this.state.gameState;
	}

	/**
	 * Destroy the controls
	 */
	destroy(): void {
		this.container.innerHTML = '';
	}
}
