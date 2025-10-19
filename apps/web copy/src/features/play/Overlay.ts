/**
 * Game Overlay Component (T027)
 * 
 * Displays game state overlays:
 * - Countdown timer (3...2...1...)
 * - Pause message ("Paused by [username]")
 * - Waiting for opponent message
 * - Game over screen
 * 
 * Feature: 002-pong-game-integration - Phase 4
 */

export type OverlayType = 
	| { type: 'countdown'; value: number }
	| { type: 'paused'; pausedBy: string; pausedByName?: string }
	| { type: 'waiting'; message: string }
	| { type: 'waiting_opponent'; onPlayBot?: () => void }
	| { type: 'game_over'; winner: string; score: { p1: number; p2: number }; reason?: string; onPlayAgain?: () => void }
	| { type: 'none' };

export class GameOverlay {
	private container: HTMLElement;
	private overlayElement: HTMLElement | null = null;

	constructor(containerId: string) {
		const element = document.getElementById(containerId);
		if (!element) {
			throw new Error(`Container ${containerId} not found`);
		}

		this.container = element;
	}

	/**
	 * Show overlay
	 */
	show(overlay: OverlayType): void {
		// Clear existing overlay
		this.hide();

		// Create overlay element
		this.overlayElement = document.createElement('div');
		this.overlayElement.className = 'absolute inset-0 z-20 flex items-center justify-center bg-black/65';
		this.overlayElement.dataset.overlayType = overlay.type;
		this.overlayElement.classList.add('pointer-events-none');

		const content = document.createElement('div');
		content.className = 'flex flex-col items-center text-center gap-4';

		switch (overlay.type) {
			case 'countdown':
				this.renderCountdown(content, overlay.value);
				break;

			case 'paused':
				this.renderPaused(content, overlay.pausedByName ?? overlay.pausedBy);
				break;

			case 'waiting':
				this.renderWaiting(content, overlay.message);
				break;

			case 'waiting_opponent':
			this.overlayElement.classList.remove('pointer-events-none');
			this.overlayElement.classList.add('pointer-events-auto');
				this.renderWaitingOpponent(content, overlay.onPlayBot);
				break;

			case 'game_over':
			this.overlayElement.classList.remove('pointer-events-none');
			this.overlayElement.classList.add('pointer-events-auto');
				this.renderGameOver(content, overlay.winner, overlay.score, overlay.reason, overlay.onPlayAgain);
				break;

			case 'none':
				// No overlay
				return;
		}

		this.overlayElement.appendChild(content);
		this.container.appendChild(this.overlayElement);
	}

	/**
	 * Hide overlay
	 */
	hide(): void {
		if (this.overlayElement) {
			this.overlayElement.remove();
			this.overlayElement = null;
		}
	}

	/**
	 * Render countdown (3...2...1...)
	 */
	private renderCountdown(container: HTMLElement, value: number): void {
		const countdownBadge = document.createElement('div');
		countdownBadge.className = 'flex h-36 w-36 items-center justify-center rounded-full border border-[#00C8FF]/40 bg-[#121217] text-5xl font-bold uppercase tracking-[0.3em] text-[#00C8FF]';
		countdownBadge.textContent = value > 0 ? String(value) : 'GO!';
		container.appendChild(countdownBadge);
	}

	/**
	 * Render paused message
	 */
	private renderPaused(container: HTMLElement, pausedByName: string): void {
		const panel = document.createElement('div');
		panel.className = 'flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-[#00C8FF]/20 bg-[#1a1a24] px-8 py-10 text-center';

		const title = document.createElement('div');
		title.className = 'text-3xl font-bold uppercase tracking-[0.35em] text-[#F59E0B]';
		title.textContent = 'Paused';

		const message = document.createElement('div');
		message.className = 'text-lg font-medium text-[#E0E0E0]';
		message.textContent = `${pausedByName} paused the match`;

		const hint = document.createElement('div');
		hint.className = 'text-sm text-[#E0E0E0]/60';
		hint.textContent = 'Only the pauser can resume the game.';

		panel.appendChild(title);
		panel.appendChild(message);
		panel.appendChild(hint);
		container.appendChild(panel);
	}

	/**
	 * Render waiting message
	 */
	private renderWaiting(container: HTMLElement, message: string): void {
		const panel = document.createElement('div');
		panel.className = 'flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-[#00C8FF]/20 bg-[#1a1a24] px-8 py-10 text-center';

		const spinner = document.createElement('div');
		spinner.className = 'h-10 w-10 animate-spin rounded-full border-4 border-[#00C8FF]/60 border-t-transparent';

		const text = document.createElement('div');
		text.className = 'text-lg font-medium text-[#E0E0E0]';
		text.textContent = message;

		panel.appendChild(spinner);
		panel.appendChild(text);
		container.appendChild(panel);
	}

	/**
	 * Render waiting for opponent message with bot option
	 */
	private renderWaitingOpponent(container: HTMLElement, onPlayBot?: () => void): void {
		const panel = document.createElement('div');
		panel.className = 'flex max-w-md flex-col items-center gap-5 rounded-2xl border border-[#00C8FF]/20 bg-[#1a1a24] px-8 py-10 text-center';

		const title = document.createElement('div');
		title.className = 'text-2xl font-semibold text-[#E0E0E0]';
		title.textContent = 'Searching for an opponent';

		const spinner = document.createElement('div');
		spinner.className = 'h-10 w-10 animate-spin rounded-full border-4 border-[#00C8FF] border-t-transparent';

		const message = document.createElement('div');
		message.className = 'text-sm text-[#E0E0E0]/70';
		message.textContent = 'Hold tight - we will load in as soon as we find a match.';

		panel.appendChild(spinner);
		panel.appendChild(title);
		panel.appendChild(message);

		if (onPlayBot) {
			const divider = document.createElement('div');
			divider.className = 'flex w-full items-center gap-4 text-xs uppercase tracking-[0.4em] text-[#E0E0E0]/40';
			const line1 = document.createElement('div');
			line1.className = 'h-px flex-1 bg-[#00C8FF]/20';
			const orText = document.createElement('span');
			orText.textContent = 'or';
			const line2 = document.createElement('div');
			line2.className = 'h-px flex-1 bg-[#00C8FF]/20';
			divider.appendChild(line1);
			divider.appendChild(orText);
			divider.appendChild(line2);

			const botButton = document.createElement('button');
			botButton.type = 'button';
			botButton.className = 'inline-flex w-full items-center justify-center gap-2 rounded border border-[#FF008C]/50 bg-[#1b1425] px-5 py-3 text-sm font-semibold uppercase tracking-wide text-[#FF008C] hover:bg-[#24172e]';
			botButton.textContent = 'Practice vs Bot';
			botButton.addEventListener('click', () => {
				botButton.disabled = true;
				botButton.classList.add('opacity-80');
				onPlayBot();
			});

			const hint = document.createElement('div');
			hint.className = 'text-xs uppercase tracking-[0.3em] text-[#E0E0E0]/40';
			hint.textContent = 'We will reconnect you automatically';

			panel.appendChild(divider);
			panel.appendChild(botButton);
			panel.appendChild(hint);
		}

		container.appendChild(panel);
	}

	/**
	 * Render game over screen
	 */
	private renderGameOver(
		container: HTMLElement,
		winner: string,
		score: { p1: number; p2: number },
		reason?: string,
		onPlayAgain?: () => void
	): void {
		const panel = document.createElement('div');
		panel.className = 'flex max-w-md flex-col items-center gap-6 rounded-2xl border border-[#00C8FF]/20 bg-[#1a1a24] px-8 py-10 text-center';

		const badge = document.createElement('div');
		badge.className = 'text-xs uppercase tracking-[0.4em] text-[#E0E0E0]/50';
		badge.textContent = 'Match Complete';

		const winnerText = document.createElement('div');
		winnerText.className = 'text-3xl font-semibold text-[#E0E0E0]';
		winnerText.textContent = `${winner} wins`;

		const scoreBox = document.createElement('div');
		scoreBox.className = 'flex items-center justify-center gap-4 rounded-xl border border-[#00C8FF]/25 bg-[#121321] px-6 py-4 text-3xl font-bold text-[#00C8FF]';

		const p1Score = document.createElement('span');
		p1Score.className = 'text-[#E0E0E0]';
		p1Score.textContent = String(score.p1);

		const dash = document.createElement('span');
		dash.className = 'text-[#00C8FF]/70';
		dash.textContent = '-';

		const p2Score = document.createElement('span');
		p2Score.className = 'text-[#E0E0E0]';
		p2Score.textContent = String(score.p2);

		scoreBox.appendChild(p1Score);
		scoreBox.appendChild(dash);
		scoreBox.appendChild(p2Score);

		const reasonText = document.createElement('div');
		reasonText.className = 'text-sm text-[#E0E0E0]/60';
		reasonText.textContent = reason === 'forfeit' ? 'Match ended by forfeit.' : 'Thanks for playing!';

		const actions = document.createElement('div');
		actions.className = 'flex w-full flex-col gap-3';

		const playAgainButton = document.createElement('button');
		playAgainButton.type = 'button';
		playAgainButton.className = 'inline-flex w-full items-center justify-center rounded border border-[#00C8FF]/50 bg-[#121425] px-5 py-3 text-sm font-semibold uppercase tracking-wide text-[#00C8FF] hover:bg-[#1a2432]';
		playAgainButton.textContent = 'Play Again';
		playAgainButton.addEventListener('click', () => {
			playAgainButton.disabled = true;
			playAgainButton.classList.add('opacity-85');
			if (onPlayAgain) {
				onPlayAgain();
			} else {
				window.location.reload();
			}
		});

		const hint = document.createElement('div');
		hint.className = 'text-xs uppercase tracking-[0.3em] text-[#E0E0E0]/40';
		hint.textContent = 'Queue resets automatically';

		actions.appendChild(playAgainButton);

		panel.appendChild(badge);
		panel.appendChild(winnerText);
		panel.appendChild(scoreBox);
		panel.appendChild(reasonText);
		panel.appendChild(actions);
		panel.appendChild(hint);

		container.appendChild(panel);
	}

	/**
	 * Destroy the overlay
	 */
	destroy(): void {
		this.hide();
	}
}
