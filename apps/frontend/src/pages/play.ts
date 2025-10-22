import { CanvasGameRenderer } from '../features/play/CanvasGame';
import { InputHandler } from '../features/play/input';
import { WSMatchClient } from '../features/play/wsMatchClient';
import { getAccessToken, getUserId } from '../lib/auth';
import { getUserProfile, getMatch, getOnlineUsers, updateMatchResult, recordPracticeMatch } from '../lib/api-client';
import { invitationManager } from '../features/invitations/InvitationManager';
import { showOpponentModal, closeOpponentModal } from '../components/OpponentModal';
import { showError } from '../components/Modal';
import { updatePlayerInfo, updateMatchMeta } from './game';
import { dashboardState } from '../features/home/state';
import type {
	JoinedMessage,
	StateMessage,
	GameOverMessage,
	CountdownMessage,
	PausedMessage,
	ResumeServerMessage,
	ReadyStateMessage,
} from '../types/ws-messages';

type GameMode = 'bot' | 'local' | 'multiplayer';
type GameScreen = 'menu' | 'loading' | 'playing' | 'end';

interface MultiplayerContext {
	matchId: string;
	opponentId?: string | null;
	autoReady?: boolean;
}

interface PlayerProfileSummary {
	id: string;
	displayName: string;
	avatarUrl: string | null;
}

interface EndScreenConfig {
	title: string;
	subtitle?: string;
	detail?: string;
	primaryLabel?: string;
	onPrimary?: () => void;
	secondaryLabel?: string;
	onSecondary?: () => void;
}

interface ControlButton {
	label: string;
	action: () => void;
	variant?: 'primary' | 'secondary' | 'danger';
	disabled?: boolean;
}

interface LocalGameRuntime {
	stop: () => void;
	setPaused: (value: boolean) => void;
}

interface LocalGameOptions {
	mode: 'bot' | 'local';
}

const LOCAL_TARGET_SCORE = 5;

class PlayPage {
	private canvas: HTMLCanvasElement | null = null;
	private flowOverlay: HTMLElement | null = null;
	private controlsEl: HTMLElement | null = null;
	private renderer: CanvasGameRenderer | null = null;
	private initialized = false;
	private inputHandler = new InputHandler();
	private token: string | null = null;
	private userId: string | null = null;

	private screen: GameScreen = 'menu';
	private mode: GameMode | null = null;
	private wsClient: WSMatchClient | null = null;
	private wsUnsubscribe: Array<() => void> = [];
	private localRuntime: LocalGameRuntime | null = null;
	private localPaused = false;
	private awaitingInviteResponse = false;
	private currentOpponentName = 'Opponent';
	private currentPlayerName = 'You';
	private currentMatchId: string | null = null;
	private currentOpponentId: string | null = null;
	private matchResultSubmitted = false;
	private lastKnownScore: { p1: number; p2: number } = { p1: 0, p2: 0 };
	private profileCache = new Map<string, PlayerProfileSummary>();
	private countdownTimers: Array<ReturnType<typeof setTimeout>> = [];
	private countdownActive = false;
	private pendingAutoReady = false;
	private hasSentReady = false;
	private latestReadyState: ReadyStateMessage | null = null;
	private countdownNumberEl: HTMLElement | null = null;
	private countdownHideTimer: ReturnType<typeof setTimeout> | null = null;

	async init(): Promise<void> {
		try {
			this.token = getAccessToken();
			this.userId = getUserId();

			if (!this.token || !this.userId) {
				this.showBlockingError('Not authenticated. Please sign in again.');
				return;
			}

			this.bindDom();

			if (!this.initialized) {
				this.renderer = new CanvasGameRenderer(this.canvas!);
				this.renderer.setOptions({ playerId: this.userId });
				this.renderer.showPlaceholder('Choose a mode to start playing');
				this.renderer.start();
				this.initialized = true;
			}

			const pending = this.consumeMultiplayerContextFromSession();
			if (pending) {
				await this.launchMultiplayerMatch(pending);
				return;
			}

			const queuedMode = this.consumeQueuedModeFromSession();
			if (queuedMode) {
				switch (queuedMode) {
					case 'bot':
						this.startLocalGame({ mode: 'bot' });
						return;
					case 'local':
						this.startLocalGame({ mode: 'local' });
						return;
					case 'multiplayer':
						void this.startMultiplayerQuickmatch();
						return;
				}
			}

			this.showMenu();
		} catch (error) {
			console.error('[PlayPage] Failed to initialize', error);
			this.showBlockingError(error instanceof Error ? error.message : 'Failed to initialize game');
		}
	}

	destroy(): void {
		this.cleanupCurrentMode();
		this.renderer?.destroy();
		this.renderer = null;
		this.initialized = false;
	}

	async beginExternalMatchLaunch(): Promise<void> {
		const context = this.consumeMultiplayerContextFromSession();
		if (!context) {
			return;
		}

		await this.launchMultiplayerMatch(context);
	}

	private bindDom(): void {
		this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
		this.flowOverlay = document.getElementById('game-flow-overlay');
		this.controlsEl = document.getElementById('game-controls');

		if (!this.canvas || !this.flowOverlay || !this.controlsEl) {
			throw new Error('Game DOM structure missing required elements');
		}
	}

	private showMenu(): void {
		this.mode = null;
		this.screen = 'menu';
		this.awaitingInviteResponse = false;
		this.currentMatchId = null;
		this.matchResultSubmitted = false;
		this.lastKnownScore = { p1: 0, p2: 0 };
		this.renderControls([]);

		this.applyDefaultScoreboard();
		this.renderer?.showPlaceholder('Choose a mode to start playing');
		this.renderMenuOverlay();
	}

	private showLoading(message: string, options?: { allowCancel?: boolean; onCancel?: () => void; subtext?: string }): void {
		this.screen = 'loading';
		if (!this.flowOverlay) {
			return;
		}

		this.clearCountdownTimers();

		this.flowOverlay.classList.remove('hidden');
		this.flowOverlay.innerHTML = '';

		const backdrop = document.createElement('div');
		backdrop.className = 'flex h-full w-full flex-col items-center justify-center gap-6 bg-[#070910]/90 px-6 py-10';

		const spinner = document.createElement('div');
		spinner.className = 'h-14 w-14 animate-spin rounded-full border-4 border-[#00C8FF]/60 border-t-transparent';

		const title = document.createElement('h2');
		title.className = 'text-2xl font-semibold uppercase tracking-[0.35em] text-[#00C8FF] text-center';
		title.textContent = message;

		backdrop.appendChild(spinner);
		backdrop.appendChild(title);

		if (options?.subtext) {
			const sub = document.createElement('p');
			sub.className = 'text-sm text-[#E0E0E0]/70 text-center max-w-3xl';
			sub.textContent = options.subtext;
			backdrop.appendChild(sub);
		}

		if (options?.allowCancel && options.onCancel) {
			const cancelButton = document.createElement('button');
			cancelButton.type = 'button';
			cancelButton.className =
				'inline-flex items-center justify-center rounded border border-[#FF4D6D]/40 bg-[#1c0f13] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#FF4D6D] transition-colors hover:bg-[#2a151b]';
			cancelButton.textContent = 'Cancel';
			cancelButton.addEventListener('click', options.onCancel);
			backdrop.appendChild(cancelButton);
		}

		this.flowOverlay.appendChild(backdrop);
		this.renderControls([]);
	}

	private renderReadyLobby(state: ReadyStateMessage | null): void {
		if (!this.flowOverlay) {
			return;
		}

		this.screen = 'loading';
		this.clearCountdownTimers();
		this.flowOverlay.classList.remove('hidden');
		this.flowOverlay.innerHTML = '';

		const players = state?.players ?? [];
		const selfId = this.userId ?? '';
		const opponentId = this.currentOpponentId ?? '';
		const selfReady = players.find((player) => player.playerId === selfId)?.ready ?? this.hasSentReady;
		const opponentReady = opponentId ? players.find((player) => player.playerId === opponentId)?.ready ?? false : false;
		const bothReady = selfReady && opponentReady;

		const backdrop = document.createElement('div');
		backdrop.className = 'flex h-full w-full flex-col items-center justify-center gap-8 bg-[#070910]/90 px-6 py-10';

		const title = document.createElement('h2');
		title.className = 'text-2xl font-semibold uppercase tracking-[0.35em] text-[#00C8FF] text-center';
		title.textContent = 'Match Lobby';
		backdrop.appendChild(title);

		const subtitle = document.createElement('p');
		subtitle.className = 'text-sm text-[#E0E0E0]/70 text-center max-w-2xl';
		subtitle.textContent = bothReady
			? 'Both players are ready. Countdown starting…'
			: selfReady
			? `Waiting for ${this.currentOpponentName} to ready up.`
			: 'Click ready when you are set. Countdown begins once both players confirm.';
		backdrop.appendChild(subtitle);

		const list = document.createElement('div');
		list.className = 'w-full max-w-sm space-y-3';

		const buildRow = (label: string, ready: boolean) => {
			const row = document.createElement('div');
			row.className = [
				'flex items-center justify-between rounded-lg border px-4 py-3 transition-colors',
				ready ? 'border-[#00C8FF]/40 bg-[#00C8FF]/10 text-[#E0E0E0]' : 'border-[#00C8FF]/15 bg-[#080d1a]/75 text-[#E0E0E0]/80',
			].join(' ');

			const name = document.createElement('span');
			name.className = 'text-sm font-semibold uppercase tracking-[0.28em]';
			name.textContent = label;

			const status = document.createElement('span');
			status.className = ready
				? 'text-xs font-semibold uppercase tracking-[0.3em] text-[#00E0A4]'
				: 'text-xs uppercase tracking-[0.3em] text-[#FFB347]';
			status.textContent = ready ? 'Ready' : 'Not Ready';

			row.appendChild(name);
			row.appendChild(status);
			return row;
		};

		list.appendChild(buildRow(this.currentPlayerName, selfReady));
		list.appendChild(buildRow(this.currentOpponentName, opponentReady));
		backdrop.appendChild(list);

		const actionArea = document.createElement('div');
		actionArea.className = 'flex w-full max-w-sm flex-col gap-3';

		const readyButton = document.createElement('button');
		readyButton.type = 'button';
		readyButton.className =
			'inline-flex items-center justify-center rounded border border-[#00C8FF]/50 bg-[#00C8FF]/10 px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#00C8FF] transition-colors hover:bg-[#00C8FF]/20 disabled:cursor-not-allowed disabled:opacity-60';
		if (selfReady) {
			readyButton.textContent = bothReady ? 'Ready! Countdown is starting…' : 'Ready — Waiting for opponent';
			readyButton.disabled = true;
		} else {
			readyButton.textContent = 'Ready Up';
			readyButton.addEventListener('click', () => {
				if (this.hasSentReady) {
					return;
				}
				this.hasSentReady = true;
				this.wsClient?.sendReady();
				this.renderReadyLobby(this.latestReadyState);
			});
		}
		actionArea.appendChild(readyButton);

		const hint = document.createElement('p');
		hint.className = 'text-[11px] uppercase tracking-[0.3em] text-[#E0E0E0]/50 text-center';
		hint.textContent = 'You can leave the lobby at any time using the controls below.';
		actionArea.appendChild(hint);

		backdrop.appendChild(actionArea);

		this.flowOverlay.appendChild(backdrop);
	}

	private updateFlowCountdown(
		seconds: number,
		options?: { screen?: GameScreen | null; backdropClass?: string; autoHide?: boolean },
	): void {
		if (!this.flowOverlay) {
			return;
		}

		if (typeof options?.screen === 'string') {
			this.screen = options.screen;
		}

		if (this.countdownHideTimer !== null) {
			clearTimeout(this.countdownHideTimer);
			this.countdownHideTimer = null;
		}

		const backdropClass =
			options?.backdropClass ?? 'flex h-full w-full items-center justify-center bg-[#070910]/90 px-6';

		if (!this.countdownNumberEl) {
			this.flowOverlay.innerHTML = '';
			const backdrop = document.createElement('div');
			backdrop.className = backdropClass;
			const number = document.createElement('div');
			number.className =
				'text-6xl sm:text-7xl md:text-8xl font-bold uppercase tracking-[0.35em] text-[#00C8FF] drop-shadow-[0_0_30px_rgba(0,200,255,0.6)] transition-transform duration-300';
			backdrop.appendChild(number);
			this.flowOverlay.appendChild(backdrop);
			this.countdownNumberEl = number;
		} else {
			const parent = this.countdownNumberEl.parentElement;
			if (parent) {
				parent.className = backdropClass;
			}
		}

		this.flowOverlay.classList.remove('hidden');

		const numberEl = this.countdownNumberEl;
		if (!numberEl) {
			return;
		}

		this.renderer?.clearCountdownOverlay();

		if (seconds <= 0) {
			numberEl.textContent = 'GO';
			numberEl.style.transform = 'scale(1.15)';

			if (options?.autoHide ?? true) {
				this.countdownHideTimer = window.setTimeout(() => {
					if (this.countdownNumberEl === numberEl) {
						this.countdownNumberEl = null;
						if (this.flowOverlay) {
							this.flowOverlay.classList.add('hidden');
							this.flowOverlay.innerHTML = '';
						}
					}
					this.countdownHideTimer = null;
				}, 600);
			}

			return;
		}

		numberEl.textContent = String(seconds);
		numberEl.style.transform = 'scale(1.1)';
		window.setTimeout(() => {
			if (this.countdownNumberEl === numberEl) {
				numberEl.style.transform = 'scale(1)';
			}
		}, 200);
	}

	private renderServerCountdown(seconds: number): void {
		this.updateFlowCountdown(seconds, { screen: 'loading' });
	}

	private clearCountdownTimers(): void {
		if (this.countdownTimers.length > 0) {
			this.countdownTimers.forEach((handle) => clearTimeout(handle));
			this.countdownTimers = [];
		}

		if (this.countdownHideTimer !== null) {
			clearTimeout(this.countdownHideTimer);
			this.countdownHideTimer = null;
		}

		if (this.flowOverlay) {
			this.flowOverlay.classList.add('hidden');
			this.flowOverlay.innerHTML = '';
		}

		this.countdownActive = false;
		this.countdownNumberEl = null;
		this.renderer?.clearCountdownOverlay();
	}

	private showCountdown(seconds: number, onComplete: () => void): void {
		if (!this.flowOverlay) {
			onComplete();
			return;
		}

		this.clearCountdownTimers();
		this.countdownActive = true;

		let remaining = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 3;

		const tick = () => {
			if (!this.countdownActive) {
				return;
			}

			const value = Math.max(0, remaining);
			this.updateFlowCountdown(value, { screen: 'loading', autoHide: false });

			if (value <= 0) {
				const hideTimer = window.setTimeout(() => {
					if (!this.countdownActive) {
						return;
					}
					this.countdownActive = false;
					this.countdownTimers = [];
					if (this.countdownHideTimer !== null) {
						clearTimeout(this.countdownHideTimer);
						this.countdownHideTimer = null;
					}
					this.countdownNumberEl = null;
					if (this.flowOverlay) {
						this.flowOverlay.classList.add('hidden');
						this.flowOverlay.innerHTML = '';
					}
					onComplete();
				}, 600);
				this.countdownTimers.push(hideTimer);
				return;
			}

			remaining -= 1;
			const nextTimer = window.setTimeout(tick, 1000);
			this.countdownTimers.push(nextTimer);
		};

		tick();
	}

	private showPlaying(): void {
		this.screen = 'playing';
		if (this.countdownHideTimer !== null) {
			clearTimeout(this.countdownHideTimer);
			this.countdownHideTimer = null;
		}
		this.countdownNumberEl = null;
		if (this.flowOverlay) {
			this.flowOverlay.classList.add('hidden');
			this.flowOverlay.innerHTML = '';
		}
	}

	private showEnd(config: EndScreenConfig): void {
		this.screen = 'end';
		if (!this.flowOverlay) {
			return;
		}

		this.flowOverlay.classList.remove('hidden');
		this.flowOverlay.innerHTML = '';

		const backdrop = document.createElement('div');
		backdrop.className = 'flex h-full w-full flex-col items-center justify-center gap-6 bg-[#070910]/90 px-6 py-10';

		const title = document.createElement('h2');
		title.className = 'text-3xl font-bold uppercase tracking-[0.35em] text-[#00C8FF] text-center';
		title.textContent = config.title;
		backdrop.appendChild(title);

		if (config.subtitle) {
			const subtitle = document.createElement('p');
			subtitle.className = 'text-lg text-[#E0E0E0] text-center';
			subtitle.textContent = config.subtitle;
			backdrop.appendChild(subtitle);
		}

		if (config.detail) {
			const detail = document.createElement('p');
			detail.className = 'text-sm text-[#E0E0E0]/70 text-center max-w-3xl';
			detail.textContent = config.detail;
			backdrop.appendChild(detail);
		}

		const buttons = document.createElement('div');
		buttons.className = 'mt-4 flex w-full max-w-3xl flex-col gap-3 sm:flex-row';

		const primaryLabel = config.primaryLabel ?? 'Play Again';
		const primaryButton = document.createElement('button');
		primaryButton.type = 'button';
		primaryButton.className =
			'inline-flex flex-1 items-center justify-center rounded border border-[#00C8FF]/60 bg-[#00C8FF]/20 px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#E0E0E0] transition-colors hover:bg-[#00C8FF]/30';
		primaryButton.textContent = primaryLabel;
		primaryButton.addEventListener('click', () => {
			config.onPrimary?.();
		});
		buttons.appendChild(primaryButton);

		const secondaryLabel = config.secondaryLabel ?? 'Main Menu';
		const secondaryButton = document.createElement('button');
		secondaryButton.type = 'button';
		secondaryButton.className =
			'inline-flex flex-1 items-center justify-center rounded border border-[#00C8FF]/30 bg-transparent px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#00C8FF] transition-colors hover:bg-[#00C8FF]/10';
		secondaryButton.textContent = secondaryLabel;
		secondaryButton.addEventListener('click', () => {
			if (config.onSecondary) {
				config.onSecondary();
			} else {
				this.returnToMenu();
			}
		});
		buttons.appendChild(secondaryButton);

		backdrop.appendChild(buttons);
		this.flowOverlay.appendChild(backdrop);
	}

	private renderControls(buttons: ControlButton[]): void {
		if (!this.controlsEl) {
			return;
		}

		this.controlsEl.innerHTML = '';

		if (!buttons.length) {
			this.controlsEl.classList.add('opacity-60');
			return;
		}

		this.controlsEl.classList.remove('opacity-60');
		for (const button of buttons) {
			const el = document.createElement('button');
			el.type = 'button';
			const variant = button.variant ?? 'primary';
			const base =
				'inline-flex items-center justify-center rounded border px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] transition-colors disabled:cursor-not-allowed disabled:opacity-60';
			const variants: Record<'primary' | 'secondary' | 'danger', string> = {
				primary: 'border-[#00C8FF]/60 bg-[#00C8FF]/20 text-[#E0E0E0] hover:bg-[#00C8FF]/30',
				secondary: 'border-[#00C8FF]/40 bg-transparent text-[#00C8FF] hover:bg-[#00C8FF]/10',
				danger: 'border-[#FF4D6D]/60 bg-[#2a1319] text-[#FF4D6D] hover:bg-[#391920]',
			};

			el.className = `${base} ${variants[variant]}`;
			el.textContent = button.label;
			el.disabled = Boolean(button.disabled);
			el.addEventListener('click', () => button.action());
			this.controlsEl.appendChild(el);
		}
	}

	private renderMenuOverlay(): void {
		if (!this.flowOverlay) {
			return;
		}

		this.flowOverlay.classList.remove('hidden');
		this.flowOverlay.innerHTML = '';

		const backdrop = document.createElement('div');
		backdrop.className = 'flex h-full w-full flex-col items-center justify-center gap-10 bg-[#070910]/90 px-6 py-10';

		const title = document.createElement('h2');
		title.className = 'text-3xl font-bold uppercase tracking-[0.3em] text-[#00C8FF] text-center';
		title.textContent = 'Choose Your Mode';
		backdrop.appendChild(title);

		const subtitle = document.createElement('p');
		subtitle.className = 'text-sm text-[#E0E0E0]/70 text-center max-w-2xl';
		subtitle.textContent = 'Jump into a quick match or warm up locally.';
		backdrop.appendChild(subtitle);

		const buttons = document.createElement('div');
		buttons.className = 'grid w-full max-w-4xl gap-4 md:grid-cols-3';

		const botBtn = this.createMenuButton('Play vs A.I. Bot', 'Solo practice against our adaptive A.I. sparring partner.', () => {
			this.startLocalGame({ mode: 'bot' });
		});

		const matchBtn = this.createMenuButton('Multiplayer Quickmatch', 'Invite an online player or auto-pair instantly.', () => {
			void this.startMultiplayerQuickmatch();
		});

		const localBtn = this.createMenuButton('Local 2-Player', 'Share the keyboard for a local showdown.', () => {
			this.startLocalGame({ mode: 'local' });
		});

		buttons.appendChild(botBtn);
		buttons.appendChild(matchBtn);
		buttons.appendChild(localBtn);

		backdrop.appendChild(buttons);
		this.flowOverlay.appendChild(backdrop);
	}

	private createMenuButton(title: string, description: string, action: () => void): HTMLElement {
		const wrapper = document.createElement('button');
		wrapper.type = 'button';
		wrapper.className =
			'group flex h-full flex-col items-start gap-2 rounded border border-[#00C8FF]/20 bg-[#121216]/80 p-6 text-left transition-transform hover:-translate-y-1 hover:border-[#00C8FF]/40 hover:bg-[#141a32]';

		const heading = document.createElement('div');
		heading.className = 'text-lg font-semibold text-[#E0E0E0]';
		heading.textContent = title;

		const desc = document.createElement('p');
		desc.className = 'text-xs text-[#E0E0E0]/60';
		desc.textContent = description;

		wrapper.appendChild(heading);
		wrapper.appendChild(desc);
		wrapper.addEventListener('click', () => action());
		return wrapper;
	}

	private async startMultiplayerQuickmatch(): Promise<void> {
		try {
			this.showLoading('Gathering opponents…');
			await invitationManager.init();
			const { players } = await getOnlineUsers();

			if (!players.length) {
				this.showMenu();
				showError('No Players Online', 'There are no available opponents right now. Try again soon.');
				return;
			}

			this.renderQuickmatchPicker(players);
		} catch (error) {
			console.error('[PlayPage] Quickmatch failed', error);
			this.showMenu();
			showError('Quickmatch Error', error instanceof Error ? error.message : 'Unable to prepare multiplayer match.');
		}
	}

	private renderQuickmatchPicker(players: Awaited<ReturnType<typeof getOnlineUsers>>['players']): void {
		if (!this.flowOverlay) {
			return;
		}

		this.flowOverlay.classList.remove('hidden');
		this.flowOverlay.innerHTML = '';

		const backdrop = document.createElement('div');
		backdrop.className = 'flex h-full w-full flex-col items-center justify-center gap-6 bg-[#070910]/90 px-6 py-10';

		const title = document.createElement('h3');
		title.className = 'text-3xl font-semibold uppercase tracking-[0.3em] text-[#00C8FF] text-center';
		title.textContent = 'Multiplayer Quickmatch';
		backdrop.appendChild(title);

		const subtitle = document.createElement('p');
		subtitle.className = 'text-sm text-[#E0E0E0]/70 text-center max-w-2xl';
		subtitle.textContent = 'Send an invite directly or let us pick someone for you.';
		backdrop.appendChild(subtitle);

		const actions = document.createElement('div');
		actions.className = 'flex w-full max-w-3xl flex-col gap-3';

		const autoBtn = document.createElement('button');
		autoBtn.type = 'button';
		autoBtn.className =
			'inline-flex w-full items-center justify-center rounded border border-[#00C8FF]/60 bg-[#00C8FF]/20 px-6 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-[#E0E0E0] transition-colors hover:bg-[#00C8FF]/30';
		autoBtn.textContent = 'Auto Pair';
		autoBtn.addEventListener('click', async () => {
			const opponent = players[Math.floor(Math.random() * players.length)];
			await this.sendMultiplayerInvite(opponent.userId);
		});
		actions.appendChild(autoBtn);

		const chooseBtn = document.createElement('button');
		chooseBtn.type = 'button';
		chooseBtn.className =
			'inline-flex w-full items-center justify-center rounded border border-[#00C8FF]/40 bg-transparent px-6 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-[#00C8FF] transition-colors hover:bg-[#00C8FF]/10';
		chooseBtn.textContent = 'Choose Opponent';
		chooseBtn.addEventListener('click', () => {
			showOpponentModal({
				players,
				onChallenge: async (opponentId: string) => {
					try {
						const exists = players.some((player) => player.userId === opponentId);
						if (!exists) {
							return;
						}
						await this.sendMultiplayerInvite(opponentId);
					} finally {
						closeOpponentModal();
					}
				},
				onClose: () => {
					if (!this.awaitingInviteResponse) {
						this.showMenu();
					}
				},
			});
		});
		actions.appendChild(chooseBtn);

		const cancelBtn = document.createElement('button');
		cancelBtn.type = 'button';
		cancelBtn.className =
			'inline-flex w-full items-center justify-center rounded border border-[#FF4D6D]/50 bg-[#1c0f13] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#FF4D6D] transition-colors hover:bg-[#2a151b]';
		cancelBtn.textContent = 'Cancel';
		cancelBtn.addEventListener('click', () => {
			this.showMenu();
		});
		actions.appendChild(cancelBtn);

		backdrop.appendChild(actions);
		this.flowOverlay.appendChild(backdrop);
	}

	private async sendMultiplayerInvite(opponentId: string): Promise<void> {
		try {
			this.awaitingInviteResponse = true;
			await invitationManager.init();
			await invitationManager.sendInvite(opponentId);
					} catch (error) {
			console.error('[PlayPage] Failed to send invite', error);
			this.awaitingInviteResponse = false;
			this.showMenu();
			showError('Invitation Error', error instanceof Error ? error.message : 'Unable to send invite.');
		}
	}

	private startLocalGame(options: LocalGameOptions): void {
		this.cleanupCurrentMode();
		this.mode = options.mode === 'bot' ? 'bot' : 'local';
		this.localPaused = false;
		this.localRuntime = null;

		const isBot = options.mode === 'bot';
		const playerTwoName = isBot ? 'Practice Bot' : 'Player 2';

		this.currentOpponentName = playerTwoName;
		this.currentPlayerName = 'You';

		applyPlayerNames('Player 1', null, playerTwoName, null, 1);
		setScoreboardScores(0, 0);
		this.lastKnownScore = { p1: 0, p2: 0 };
		updateMatchMeta('status', 'Countdown');
		updateMatchMeta('mode', isBot ? 'Solo' : 'Local Multiplayer');
		updateMatchMeta('latency', 'Offline');
		setScoreboardTarget(isBot ? 'First to Five' : 'First to Five');

		this.renderer?.showPlaceholder('Get ready!');
		this.clearCountdownTimers();
		this.renderControls([]);

		this.showCountdown(3, () => {
			updateMatchMeta('status', isBot ? 'Practice' : 'Local Versus');
			this.showPlaying();
			const runtime = this.runLocalArcade(options.mode);
			this.localRuntime = runtime;
			this.renderControls(this.buildLocalControls());
		});
	}

	private buildLocalControls(): ControlButton[] {
		if (!this.localRuntime) {
			return [];
		}

		return [
			{
				label: this.localPaused ? 'Resume' : 'Pause',
				variant: 'primary',
				action: () => {
					this.localPaused = !this.localPaused;
					this.localRuntime?.setPaused(this.localPaused);
					this.renderControls(this.buildLocalControls());
					updateMatchMeta('status', this.localPaused ? 'Paused' : this.mode === 'bot' ? 'Practice' : 'Local Versus');
				},
			},
			{
				label: 'Restart',
				variant: 'secondary',
				action: () => {
					const mode = this.mode === 'bot' ? 'bot' : 'local';
					this.startLocalGame({ mode });
				},
			},
			{
				label: 'Exit',
				variant: 'danger',
				action: () => {
					this.returnToMenu();
				},
			},
		];
	}

	private runLocalArcade(mode: 'bot' | 'local'): LocalGameRuntime {
		const canvas = this.canvas;
		if (!canvas) {
			throw new Error('Canvas not available');
		}

		let animationId: number | null = null;
		let lastTimestamp: number | null = null;
		let paused = false;
		let finished = false;

		const paddleHeight = 0.18;
		const paddleWidth = 0.02;
		const ballSize = 0.02;
		const paddleSpeed = 0.9;
		const botMaxSpeed = 0.95;
		const botMinSpeed = 0.45;
		const botReactionDelay = 0.12;
		const botRandomAimOffset = 0.12;
		const botCenterY = 0.5;
		const botMistakeChance = 0.22;
		const baseBallSpeed = 0.6;
		const ballSpeedIncrease = 1.05;

		let p1Y = 0.5;
		let p2Y = 0.5;
		let ballX = 0.5;
		let ballY = 0.5;
		let currentBallSpeed = baseBallSpeed;
		let ballVX = currentBallSpeed * (Math.random() > 0.5 ? 1 : -1);
		let ballVY = currentBallSpeed * (Math.random() * 0.6 - 0.3);
		currentBallSpeed = Math.sqrt(ballVX * ballVX + ballVY * ballVY);
		let scoreP1 = 0;
		let scoreP2 = 0;
		let botTargetY = botCenterY;
		let botReactionTimer = 0;

		const keys: Record<string, boolean> = {};

		const clampPaddle = (y: number): number =>
			Math.max(paddleHeight / 2, Math.min(1 - paddleHeight / 2, y));

		const resetBall = (direction: 1 | -1) => {
			currentBallSpeed = baseBallSpeed;
			ballX = 0.5;
			ballY = 0.5;
			const angle = (Math.random() * Math.PI) / 3 - Math.PI / 6;
			ballVX = currentBallSpeed * Math.cos(angle) * direction;
			ballVY = currentBallSpeed * Math.sin(angle);
		};

		const scheduleServeCountdown = (direction: 1 | -1) => {
			this.clearCountdownTimers();
			paused = true;
			updateMatchMeta('status', 'Countdown');
			resetKeyMap();
			p1Y = 0.5;
			p2Y = 0.5;
			ballX = 0.5;
			ballY = 0.5;
			ballVX = 0;
			ballVY = 0;
			this.renderer?.setState({
				ball: { x: ballX, y: ballY },
				p1: { y: p1Y },
				p2: { y: p2Y },
				score: { p1: scoreP1, p2: scoreP2 },
			});

			const sequence = [3, 2, 1, 0] as const;
			sequence.forEach((value, index) => {
				const handle = window.setTimeout(() => {
					if (finished) {
						return;
					}
					const isFinal = value === 0;
					this.updateFlowCountdown(value);
					if (!isFinal) {
						return;
					}
					const resumeTimer = window.setTimeout(() => {
						if (finished) {
							return;
						}
						resetBall(direction);
						lastTimestamp = null;
						paused = this.localPaused;
						updateMatchMeta('status', this.mode === 'bot' ? 'Practice' : 'Local Versus');
					}, 600);
					this.countdownTimers.push(resumeTimer);
				}, index * 1000);
				this.countdownTimers.push(handle);
			});

		};

		const normalizeBounce = (y: number): number => {
			let adjusted = y;
			while (adjusted < 0 || adjusted > 1) {
				if (adjusted < 0) {
					adjusted = -adjusted;
				} else if (adjusted > 1) {
					adjusted = 2 - adjusted;
				}
			}
			return adjusted;
		};

		const predictBotIntercept = (): number => {
			if (ballVX <= 0.01) {
				return clampPaddle(ballY);
			}

			const targetX = 1 - paddleWidth;
			const travelX = targetX - ballX;
			if (travelX <= 0) {
				return clampPaddle(ballY);
			}

			const timeToReach = travelX / ballVX;
			if (timeToReach <= 0 || !Number.isFinite(timeToReach)) {
				return clampPaddle(ballY);
			}

			const projectedY = normalizeBounce(ballY + ballVY * timeToReach);
			return clampPaddle(projectedY);
		};

		const updateBotPlayer = (dt: number) => {
			botReactionTimer += dt;
			const ballApproaching = ballVX > 0;

			if (ballApproaching) {
				if (botReactionTimer >= botReactionDelay) {
					botReactionTimer = 0;
					const predicted = predictBotIntercept();
					let offset = (Math.random() - 0.5) * botRandomAimOffset;

					if (Math.random() < botMistakeChance) {
						offset += (Math.random() - 0.5) * 0.25;
					}

					const verticalBias = (Math.random() - 0.5) * Math.abs(ballVY) * 0.18;
					botTargetY = clampPaddle(predicted + offset + verticalBias);
				}
			} else if (botReactionTimer >= botReactionDelay * 1.5) {
				botReactionTimer = 0;
				const offset = (Math.random() - 0.5) * 0.12;
				botTargetY = clampPaddle(botCenterY + offset);
			}

			const error = botTargetY - p2Y;
			if (Math.abs(error) < 0.005) {
				return;
			}

			const direction = Math.sign(error);
			const speedScale = Math.min(1, Math.abs(error) * 4);
			const proximityBoost = Math.max(0, Math.min(1, (ballX - 0.6) * 1.7));
			const baseSpeed = botMinSpeed + (botMaxSpeed - botMinSpeed) * speedScale;
			const accuracyFactor = 0.7 + Math.max(0, 0.3 - Math.min(0.3, Math.abs(ballVY) * 0.45));
			const speed = Math.min(botMaxSpeed, (baseSpeed + proximityBoost * 0.3) * accuracyFactor);

			p2Y = clampPaddle(p2Y + direction * speed * dt);
		};

		const resetKeyMap = () => {
			keys['w'] = false;
			keys['W'] = false;
			keys['s'] = false;
			keys['S'] = false;
			keys['ArrowUp'] = false;
			keys['ArrowDown'] = false;
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (finished) return;
			if (['w', 'W', 's', 'S', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
				event.preventDefault();
				keys[event.key] = true;
			}
			if (event.key === ' ') {
				event.preventDefault();
				this.localPaused = !this.localPaused;
				paused = this.localPaused;
				updateMatchMeta('status', this.localPaused ? 'Paused' : this.mode === 'bot' ? 'Practice' : 'Local Versus');
				this.renderControls(this.buildLocalControls());
			}
		};

		const handleKeyUp = (event: KeyboardEvent) => {
			if (finished) return;
			if (['w', 'W', 's', 'S', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
				event.preventDefault();
				keys[event.key] = false;
			}
		};

		const handleWindowBlur = () => {
			resetKeyMap();
		};

		const handleVisibilityChange = () => {
			if (document.visibilityState !== 'visible') {
				resetKeyMap();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);
		window.addEventListener('blur', handleWindowBlur);
		document.addEventListener('visibilitychange', handleVisibilityChange);

		const update = (dt: number) => {
			if (this.localPaused) {
				return;
			}

			// Player 1 (W/S or Arrow keys if local)
			if (keys['w'] || keys['W'] || (mode === 'bot' && keys['ArrowUp'])) {
				p1Y = clampPaddle(p1Y - paddleSpeed * dt);
			} else if (keys['s'] || keys['S'] || (mode === 'bot' && keys['ArrowDown'])) {
				p1Y = clampPaddle(p1Y + paddleSpeed * dt);
			}

			// Player 2
			if (mode === 'local') {
				if (keys['ArrowUp']) {
					p2Y = clampPaddle(p2Y - paddleSpeed * dt);
				} else if (keys['ArrowDown']) {
					p2Y = clampPaddle(p2Y + paddleSpeed * dt);
				}
			} else {
				// Bot predicts ball position and reacts quickly
				updateBotPlayer(dt);
			}

		ballX += ballVX * dt;
			ballY += ballVY * dt;

			// Wall collisions
			if (ballY - ballSize / 2 <= 0) {
				ballY = ballSize / 2;
				ballVY = Math.abs(ballVY);
			} else if (ballY + ballSize / 2 >= 1) {
				ballY = 1 - ballSize / 2;
				ballVY = -Math.abs(ballVY);
			}

			// Paddle collisions
			const applyPaddleBounce = (isPlayerOne: boolean, paddleX: number, paddleY: number) => {
				const offset = (ballY - paddleY) / (paddleHeight / 2);
				const clampedOffset = Math.max(-1, Math.min(1, offset));
				const newSpeed = currentBallSpeed * ballSpeedIncrease;
				const vy = newSpeed * clampedOffset * 0.75;
				const horizontalComponent = Math.sqrt(Math.max(1e-6, newSpeed * newSpeed - vy * vy));
				ballX = isPlayerOne ? paddleX + ballSize / 2 : paddleX - ballSize / 2;
				ballVX = isPlayerOne ? horizontalComponent : -horizontalComponent;
				ballVY = vy;
				currentBallSpeed = newSpeed;
			};

			const checkPaddleCollision = (isPlayerOne: boolean): boolean => {
				const paddleX = isPlayerOne ? paddleWidth : 1 - paddleWidth;
				const paddleY = isPlayerOne ? p1Y : p2Y;
				const ballEdgeX = ballX + (isPlayerOne ? -ballSize / 2 : ballSize / 2);

				if (isPlayerOne) {
					if (ballEdgeX <= paddleX) {
						if (Math.abs(ballY - paddleY) <= paddleHeight / 2) {
							applyPaddleBounce(true, paddleX, paddleY);
							return true;
						}
						return false;
					}
				} else {
					if (ballEdgeX >= paddleX) {
						if (Math.abs(ballY - paddleY) <= paddleHeight / 2) {
							applyPaddleBounce(false, paddleX, paddleY);
							return true;
						}
						return false;
					}
				}
				return true;
			};

		const hitP1 = checkPaddleCollision(true);
		if (!hitP1 && ballX < 0) {
			scoreP2++;
				setScoreboardScores(scoreP1, scoreP2);
			this.lastKnownScore = { p1: scoreP1, p2: scoreP2 };
			if (scoreP2 >= LOCAL_TARGET_SCORE) {
				ballX = 0.5;
				ballY = 0.5;
				ballVX = 0;
				ballVY = 0;
				this.renderer?.setState({
					ball: { x: ballX, y: ballY },
					p1: { y: p1Y },
					p2: { y: p2Y },
					score: { p1: scoreP1, p2: scoreP2 },
				});
				finished = true;
				this.finishLocalGame(scoreP1, scoreP2, mode);
				return;
			}
			scheduleServeCountdown(1);
		}

		const hitP2 = checkPaddleCollision(false);
		if (!hitP2 && ballX > 1) {
			scoreP1++;
				setScoreboardScores(scoreP1, scoreP2);
			this.lastKnownScore = { p1: scoreP1, p2: scoreP2 };
			if (scoreP1 >= LOCAL_TARGET_SCORE) {
				ballX = 0.5;
				ballY = 0.5;
				ballVX = 0;
				ballVY = 0;
				this.renderer?.setState({
					ball: { x: ballX, y: ballY },
					p1: { y: p1Y },
					p2: { y: p2Y },
					score: { p1: scoreP1, p2: scoreP2 },
				});
				finished = true;
				this.finishLocalGame(scoreP1, scoreP2, mode);
				return;
			}
			scheduleServeCountdown(-1);
		}

			this.renderer?.setState({
				ball: { x: ballX, y: ballY },
				p1: { y: p1Y },
				p2: { y: p2Y },
				score: { p1: scoreP1, p2: scoreP2 },
			});

		if (scoreP1 >= LOCAL_TARGET_SCORE || scoreP2 >= LOCAL_TARGET_SCORE) {
			finished = true;
			this.finishLocalGame(scoreP1, scoreP2, mode);
		}
		};

		const loop = (timestamp: number) => {
			if (finished) {
				return;
			}

			if (lastTimestamp === null) {
				lastTimestamp = timestamp;
				animationId = window.requestAnimationFrame(loop);
				return;
			}

			const deltaTime = Math.min(0.12, (timestamp - lastTimestamp) / 1000);
			lastTimestamp = timestamp;

			if (!paused) {
				update(deltaTime);
			}

			animationId = window.requestAnimationFrame(loop);
		};

		animationId = window.requestAnimationFrame(loop);

		return {
			setPaused: (value: boolean) => {
				this.localPaused = value;
				paused = value;
			},
			stop: () => {
				finished = true;
				if (animationId !== null) {
					cancelAnimationFrame(animationId);
					animationId = null;
				}
				window.removeEventListener('keydown', handleKeyDown);
				window.removeEventListener('keyup', handleKeyUp);
				window.removeEventListener('blur', handleWindowBlur);
				document.removeEventListener('visibilitychange', handleVisibilityChange);
				resetKeyMap();
			},
		};
	}

	private finishLocalGame(scoreP1: number, scoreP2: number, mode: 'bot' | 'local'): void {
		this.clearCountdownTimers();
		this.localRuntime?.stop();
		this.localRuntime = null;

		this.lastKnownScore = { p1: scoreP1, p2: scoreP2 };

		const playerOneName = mode === 'bot' ? 'You' : 'Player 1';
		const playerTwoName = mode === 'bot' ? 'Practice Bot' : 'Player 2';
		const playerOneWins = scoreP1 > scoreP2;

		const title = playerOneWins ? `${playerOneName} Wins!` : `${playerTwoName} Wins!`;
		const subtitle = `Final score ${scoreP1} - ${scoreP2}`;

		this.showEnd({
			title,
			subtitle,
			primaryLabel: 'Play Again',
			onPrimary: () => {
				const restartMode = mode === 'bot' ? 'bot' : 'local';
				this.startLocalGame({ mode: restartMode });
			},
		});

		if (mode === 'bot') {
			void this.recordPracticeResult(scoreP1, scoreP2);
		}
	}

	private async launchMultiplayerMatch(context: MultiplayerContext): Promise<void> {
		this.cleanupCurrentMode();

		this.mode = 'multiplayer';
		this.screen = 'loading';
		this.currentMatchId = context.matchId;
		this.matchResultSubmitted = false;

		updateMatchMeta('status', 'Connecting');
		updateMatchMeta('mode', 'Multiplayer');
		updateMatchMeta('latency', 'Syncing…');
		this.showLoading('Connecting to match…');

		if (!this.token || !this.userId) {
			this.showBlockingError('Not authenticated. Please sign in again.');
			return;
		}

		try {
			const match = await getMatch(context.matchId);
			const opponentId = this.userId === match.p1Id ? match.p2Id : match.p1Id;
			if (!opponentId) {
				throw new Error('Opponent not assigned yet.');
			}

			this.currentOpponentId = opponentId;

			const [selfProfile, opponentProfile] = await Promise.all([
				this.ensureProfile(this.userId),
				this.ensureProfile(opponentId),
			]);

			const amIPlayer1 = match.p1Id === this.userId;
			this.currentPlayerName = selfProfile.displayName;
			this.currentOpponentName = opponentProfile.displayName;

      if (amIPlayer1) {
        applyPlayerNames(
          selfProfile.displayName,
          selfProfile.avatarUrl,
          opponentProfile.displayName,
          opponentProfile.avatarUrl,
          1,
          this.userId,
          opponentId
        );
      } else {
        applyPlayerNames(
          opponentProfile.displayName,
          opponentProfile.avatarUrl,
          selfProfile.displayName,
          selfProfile.avatarUrl,
          2,
          opponentId,
          this.userId
        );
      }
			setScoreboardTarget('First to Five');

			setScoreboardScores(match.p1Score ?? 0, match.p2Score ?? 0);
			this.lastKnownScore = {
				p1: match.p1Score ?? 0,
				p2: match.p2Score ?? 0,
			};
			this.renderer?.setOptions({ playerId: this.userId, p1Id: match.p1Id, p2Id: match.p2Id });

			await this.connectMultiplayerSocket(context);
		} catch (error) {
			console.error('[PlayPage] Multiplayer launch failed', error);
			this.showBlockingError(error instanceof Error ? error.message : 'Unable to join multiplayer match.');
		}
	}

	private async connectMultiplayerSocket(context: MultiplayerContext): Promise<void> {
		this.wsClient = new WSMatchClient(context.matchId);

		this.pendingAutoReady = Boolean(context.autoReady);
		this.hasSentReady = false;
		this.latestReadyState = null;
		if (this.countdownHideTimer !== null) {
			clearTimeout(this.countdownHideTimer);
			this.countdownHideTimer = null;
		}
		this.countdownNumberEl = null;

		this.wsUnsubscribe.forEach((unsubscribe) => unsubscribe());
		this.wsUnsubscribe = [];

		this.wsUnsubscribe.push(
			this.wsClient.onJoined((joined) => {
				this.handleMultiplayerJoined(joined);
			}),
		);

		this.wsUnsubscribe.push(
			this.wsClient.onReadyState((ready) => {
				this.handleReadyState(ready);
			}),
		);

		this.wsUnsubscribe.push(
			this.wsClient.onState((state) => {
				this.handleMultiplayerState(state);
			}),
		);

		this.wsUnsubscribe.push(
			this.wsClient.onCountdown((countdown) => {
				this.handleCountdown(countdown);
			}),
		);

		this.wsUnsubscribe.push(
			this.wsClient.onPaused((paused) => {
				this.handlePause(paused);
			}),
		);

		this.wsUnsubscribe.push(
			this.wsClient.onResume((resume) => {
				this.handleResume(resume);
			}),
		);

		this.wsUnsubscribe.push(
			this.wsClient.onGameOver((gameOver) => {
				this.handleMultiplayerGameOver(gameOver);
			}),
		);

		this.wsUnsubscribe.push(
			this.wsClient.onError((error) => {
				console.error('[PlayPage] Match error', error);
				showError('Match Error', error.message ?? 'Unexpected error occurred.');
			}),
		);

		this.wsUnsubscribe.push(
			this.wsClient.onDisconnect(() => {
				updateMatchMeta('status', 'Disconnected');
				updateMatchMeta('latency', '--');
				this.renderControls([
					{
						label: 'Reconnect',
						variant: 'primary',
						action: () => {
							if (this.currentMatchId) {
								void this.launchMultiplayerMatch({
									matchId: this.currentMatchId,
									opponentId: context.opponentId,
									autoReady: true,
								});
							} else {
								this.returnToMenu();
							}
						},
					},
					{
						label: 'Return to Menu',
						variant: 'secondary',
						action: () => this.returnToMenu(),
					},
				]);
			}),
		);

		await this.wsClient.connect(this.token!);
		this.wsClient.joinMatch();

		this.renderControls([
			{
				label: 'Leave Match',
				variant: 'danger',
				action: () => this.leaveMultiplayer(),
			},
		]);
	}

	private handleMultiplayerJoined(joined: JoinedMessage): void {
		updateMatchMeta('status', joined.match.state === 'playing' ? 'Playing' : 'Match Lobby');
		updateMatchMeta('latency', 'Syncing…');
		setScoreboardScores(joined.match.p1Score ?? 0, joined.match.p2Score ?? 0);

		if (joined.match.state === 'playing') {
			this.showPlaying();
		} else if (joined.match.state === 'waiting' && this.latestReadyState) {
			this.renderReadyLobby(this.latestReadyState);
		} else if (joined.match.state === 'waiting') {
			this.renderReadyLobby(null);
		} else if (joined.match.state === 'countdown') {
			this.renderReadyLobby(this.latestReadyState);
		}

		this.startMultiplayerInput();
	}

	private handleMultiplayerState(state: StateMessage): void {
		if (this.screen !== 'playing') {
			this.showPlaying();
		}

		updateMatchMeta('status', 'Playing');
		updateMatchMeta('latency', 'In Sync');
		setScoreboardScores(state.score.p1, state.score.p2);
		this.lastKnownScore = { p1: state.score.p1, p2: state.score.p2 };

		this.renderer?.setState({
			ball: { x: state.ball.x, y: state.ball.y },
			p1: { y: state.p1.y },
			p2: { y: state.p2.y },
			score: state.score,
		});
	}

	private handleReadyState(ready: ReadyStateMessage): void {
		this.latestReadyState = ready;

		const selfId = this.userId;
		const alreadyReady = ready.players.some((player) => player.playerId === selfId && player.ready);
		if (ready.state === 'waiting') {
			this.renderReadyLobby(ready);
		}

		if (this.pendingAutoReady && !this.hasSentReady && alreadyReady) {
			this.hasSentReady = true;
			this.pendingAutoReady = false;
		}

		if (this.pendingAutoReady && !this.hasSentReady && !alreadyReady) {
			this.hasSentReady = true;
			this.wsClient?.sendReady();
			this.renderReadyLobby(ready);
			this.pendingAutoReady = false;
		}
	}

	private handleCountdown(countdown: CountdownMessage): void {
		updateMatchMeta('status', 'Countdown');
		this.renderServerCountdown(Math.max(0, Math.round(countdown.seconds)));
	}

	private handlePause(paused: PausedMessage): void {
		updateMatchMeta('status', 'Paused');
		this.showLoading(`${this.getNameForUser(paused.pausedBy)} paused the match`, {
			subtext: 'Waiting for resume…',
		});
	}

	private handleResume(_resume: ResumeServerMessage): void {
		updateMatchMeta('status', 'Playing');
		this.showPlaying();
	}

private handleMultiplayerGameOver(gameOver: GameOverMessage): void {
	this.inputHandler.stop();

	const finalScores = {
		p1: gameOver.p1Score ?? this.lastKnownScore.p1,
		p2: gameOver.p2Score ?? this.lastKnownScore.p2,
	};
	this.lastKnownScore = finalScores;

	if (this.currentMatchId && !this.matchResultSubmitted) {
		this.matchResultSubmitted = true;
		void this.submitMatchResult(gameOver, finalScores);
	}

	this.renderer?.setState({
		ball: { x: 0.5, y: 0.5 },
		p1: { y: 0.5 },
		p2: { y: 0.5 },
		score: { p1: finalScores.p1, p2: finalScores.p2 },
	});

	const amIWinner = gameOver.winnerId === this.userId;
		const title = amIWinner ? 'You Win!' : `${this.currentOpponentName} Wins`;
		const reason =
			gameOver.reason === 'forfeit'
				? `${this.getNameForUser(gameOver.winnerId)} wins by forfeit.`
				: gameOver.reason === 'disconnect'
				? 'Match ended due to disconnect.'
				: 'Match completed to score limit.';

		updateMatchMeta('status', 'Completed');
		updateMatchMeta('latency', '--');
		setScoreboardScores(finalScores.p1, finalScores.p2);

		this.showEnd({
			title,
			subtitle: `Final score ${finalScores.p1} - ${finalScores.p2}`,
			detail: reason,
			primaryLabel: 'Find New Opponent',
			onPrimary: () => {
				this.returnToMenu();
				void this.startMultiplayerQuickmatch();
			},
		});

		this.cleanupMultiplayerSession();
}

	private async submitMatchResult(gameOver: GameOverMessage, scores: { p1: number; p2: number }): Promise<void> {
		if (!this.currentMatchId) {
			return;
		}
		try {
			await updateMatchResult(this.currentMatchId, {
				winnerId: gameOver.winnerId,
				p1Score: scores.p1,
				p2Score: scores.p2,
			});
			await this.refreshDashboardStats();
			window.dispatchEvent(
				new CustomEvent('ladder:refresh', {
					detail: { matchId: this.currentMatchId },
				}),
			);
		} catch (error) {
			console.error('[PlayPage] Failed to record match result', error);
		}
	}

	private async recordPracticeResult(playerScore: number, botScore: number): Promise<void> {
		if (!this.userId) {
			return;
		}
		try {
			await recordPracticeMatch({
				playerScore,
				botScore,
				result: playerScore >= botScore ? 'win' : 'loss',
			});
			await this.refreshDashboardStats();
		} catch (error) {
			console.error('[PlayPage] Failed to record practice match', error);
		}
	}

	private async refreshDashboardStats(): Promise<void> {
		if (!this.userId) {
			return;
		}
		try {
			await dashboardState.refresh(this.userId);
		} catch (error) {
			console.warn('[PlayPage] Failed to refresh dashboard stats', error);
		}
	}

	private startMultiplayerInput(): void {
		this.inputHandler.stop();
		this.inputHandler.start((direction, seq) => {
			this.wsClient?.sendInput(direction, seq);
		});
	}

	private ensureProfile(userId: string): Promise<PlayerProfileSummary> {
		const existing = this.profileCache.get(userId);
		if (existing) {
			return Promise.resolve(existing);
		}

		return getUserProfile(userId).then((profile) => {
			const summary: PlayerProfileSummary = {
				id: userId,
				displayName: profile.displayName,
				avatarUrl: profile.avatarUrl,
			};
			this.profileCache.set(userId, summary);
			return summary;
		});
	}

	private getNameForUser(userId: string): string {
		if (userId === this.userId) {
			return this.currentPlayerName;
		}

		if (this.profileCache.has(userId)) {
			return this.profileCache.get(userId)!.displayName;
		}

		return this.currentOpponentName;
	}

	private leaveMultiplayer(): void {
		if (this.wsClient) {
			try {
				this.wsClient.sendForfeit();
			} catch {
				// Ignore send errors
			}
		}
		this.returnToMenu();
	}

	private returnToMenu(): void {
		this.cleanupCurrentMode();
		this.showMenu();
	}

	private cleanupCurrentMode(): void {
		this.clearCountdownTimers();

		if (this.localRuntime) {
			this.localRuntime.stop();
			this.localRuntime = null;
		}

		this.inputHandler.stop();

		if (this.wsClient) {
			try {
				this.wsClient.leaveMatch();
				this.wsClient.close();
			} catch {
				// ignore
			}
			this.wsClient = null;
		}

		this.wsUnsubscribe.forEach((unsubscribe) => unsubscribe());
		this.wsUnsubscribe = [];
		this.awaitingInviteResponse = false;
		this.renderer?.setState(null);
		this.matchResultSubmitted = false;
		this.latestReadyState = null;
		this.pendingAutoReady = false;
		this.hasSentReady = false;
		this.currentOpponentId = null;
		this.currentMatchId = null;
		this.currentOpponentName = 'Opponent';
		this.currentPlayerName = 'You';
}

	private cleanupMultiplayerSession(): void {
		this.inputHandler.stop();
		if (this.wsClient) {
			try {
				this.wsClient.close();
			} catch {
				// Ignore
			}
		}
		this.wsClient = null;
		this.wsUnsubscribe.forEach((unsubscribe) => unsubscribe());
		this.wsUnsubscribe = [];
		this.matchResultSubmitted = false;
		this.latestReadyState = null;
		this.pendingAutoReady = false;
		this.hasSentReady = false;
		if (this.countdownHideTimer !== null) {
			clearTimeout(this.countdownHideTimer);
			this.countdownHideTimer = null;
		}
		this.countdownNumberEl = null;
		this.currentOpponentId = null;
		this.currentOpponentName = 'Opponent';
		this.currentPlayerName = 'You';
		this.currentMatchId = null;
}

	private consumeMultiplayerContextFromSession(): MultiplayerContext | null {
		const matchId = sessionStorage.getItem('currentMatchId');
		const opponentId = sessionStorage.getItem('currentOpponentId');
		const autoReady = sessionStorage.getItem('matchAutoReady') === '1';

		if (!matchId) {
			return null;
		}

		sessionStorage.removeItem('currentMatchId');
		sessionStorage.removeItem('currentOpponentId');
		sessionStorage.removeItem('matchAutoReady');

		return {
			matchId,
			opponentId,
			autoReady,
		};
	}

	private consumeQueuedModeFromSession(): GameMode | null {
		const queued = sessionStorage.getItem('queuedPlayMode');
		if (!queued) {
			return null;
		}
		sessionStorage.removeItem('queuedPlayMode');
		if (queued === 'bot' || queued === 'local' || queued === 'multiplayer') {
			return queued;
		}
		return null;
	}

	private showBlockingError(message: string): void {
		showError('Game Error', message);
		updateMatchMeta('status', 'Error');
		updateMatchMeta('latency', '--');
		this.renderControls([
			{
				label: 'Back to Menu',
				variant: 'secondary',
				action: () => this.returnToMenu(),
			},
		]);
		if (this.flowOverlay) {
			this.flowOverlay.classList.remove('hidden');
			this.flowOverlay.innerHTML = '';
			const panel = document.createElement('div');
			panel.className =
				'w-full max-w-sm space-y-4 rounded border border-[#FF4D6D]/40 bg-[#1a0f11]/95 p-8 text-center shadow-[0_0_20px_rgba(255,77,109,0.2)]';
			const title = document.createElement('h2');
			title.className = 'text-lg font-semibold uppercase tracking-[0.3em] text-[#FF4D6D]';
			title.textContent = 'Something went wrong';
			const text = document.createElement('p');
			text.className = 'text-xs text-[#E0E0E0]/70';
			text.textContent = message;
			panel.appendChild(title);
			panel.appendChild(text);
			this.flowOverlay.appendChild(panel);
		}
	}

	private applyDefaultScoreboard(): void {
		applyPlayerNames('Player 1', null, 'Player 2', null, 1);
		setScoreboardScores(0, 0);
		updateMatchMeta('status', 'Select Mode');
		updateMatchMeta('mode', 'Menu');
		updateMatchMeta('latency', '--');
		setScoreboardTarget('First to Five');
	}

	getMode(): GameMode | null {
		return this.mode;
	}
}

type PlayerRole = 'local' | 'opponent';

const PLAYER_LABEL_COLOR_CLASSES = ['text-[#00C8FF]/60', 'text-[#FF008C]/60'] as const;
const PLAYER_SCORE_BORDER_CLASSES = ['border-[#00C8FF]/40', 'border-[#FF008C]/40'] as const;
const PLAYER_SCORE_BG_CLASSES = ['bg-[#00C8FF]/10', 'bg-[#FF008C]/10'] as const;
const PLAYER_SCORE_TEXT_CLASSES = ['text-[#00C8FF]', 'text-[#FF008C]'] as const;
const AVATAR_BORDER_CLASSES = ['border-[#00C8FF]', 'border-[#FF008C]'] as const;
const AVATAR_INITIALS_CLASSES = ['text-[#00C8FF]', 'text-[#FF008C]'] as const;
const SCOREBOARD_COLOR_CLASSES = ['text-[#00C8FF]', 'text-[#FF008C]'] as const;

type ScoreboardMatchSide = 1 | 2;

interface ScoreboardPlayerState {
	name: string;
	avatar: string | null;
	userId?: string | null;
}

const scoreboardState: {
	localMatchSide: ScoreboardMatchSide;
	local: ScoreboardPlayerState;
	opponent: ScoreboardPlayerState;
	matchScores: { p1: number; p2: number };
} = {
	localMatchSide: 1,
	local: { name: 'Player 1', avatar: null, userId: null },
	opponent: { name: 'Player 2', avatar: null, userId: null },
	matchScores: { p1: 0, p2: 0 },
};
function setScoreboardTarget(text: string): void {
	const target = document.getElementById('match-score-target');
	if (target) {
		target.textContent = text;
	}
}

function renderScoreboardPlayers(): void {
	updatePlayerInfo(1, scoreboardState.local.name, scoreboardState.local.avatar, scoreboardState.local.userId ?? undefined);
	updatePlayerInfo(2, scoreboardState.opponent.name, scoreboardState.opponent.avatar, scoreboardState.opponent.userId ?? undefined);
	setPlayerCardRole(1, 'local');
	setPlayerCardRole(2, 'opponent');
}

function renderScoreboardScores(): void {
	const { p1, p2 } = scoreboardState.matchScores;
	const localScore = scoreboardState.localMatchSide === 1 ? p1 : p2;
	const opponentScore = scoreboardState.localMatchSide === 1 ? p2 : p1;

	const player1ScoreEl = document.getElementById('player1-score');
	const player2ScoreEl = document.getElementById('player2-score');
	const matchScorePlayerEl = document.getElementById('match-score-player');
	const matchScoreOpponentEl = document.getElementById('match-score-opponent');

	if (player1ScoreEl) {
		player1ScoreEl.textContent = String(localScore);
	}
	if (player2ScoreEl) {
		player2ScoreEl.textContent = String(opponentScore);
	}
	if (matchScorePlayerEl) {
		matchScorePlayerEl.textContent = String(localScore);
	}
	if (matchScoreOpponentEl) {
		matchScoreOpponentEl.textContent = String(opponentScore);
	}

	applyScoreboardColors();
}

function setScoreboardPlayers(local: ScoreboardPlayerState, opponent: ScoreboardPlayerState, localMatchSide: ScoreboardMatchSide): void {
	scoreboardState.local = { ...local };
	scoreboardState.opponent = { ...opponent };
	scoreboardState.localMatchSide = localMatchSide;
	renderScoreboardPlayers();
	renderScoreboardScores();
}

function setScoreboardScores(p1Score: number, p2Score: number): void {
	scoreboardState.matchScores = { p1: p1Score, p2: p2Score };
	renderScoreboardScores();
}

function setPlayerCardRole(player: 1 | 2, role: PlayerRole): void {
  const label = document.getElementById(`player${player}-label`);
  if (label) {
    label.classList.remove(...PLAYER_LABEL_COLOR_CLASSES);
    label.classList.add(role === 'local' ? PLAYER_LABEL_COLOR_CLASSES[0] : PLAYER_LABEL_COLOR_CLASSES[1]);
    label.textContent = role === 'local' ? 'YOU' : 'OPPONENT';
  }

  const score = document.getElementById(`player${player}-score`);
  if (score) {
    score.classList.remove(...PLAYER_SCORE_BORDER_CLASSES, ...PLAYER_SCORE_BG_CLASSES, ...PLAYER_SCORE_TEXT_CLASSES);
    if (role === 'local') {
      score.classList.add(PLAYER_SCORE_BORDER_CLASSES[0], PLAYER_SCORE_BG_CLASSES[0], PLAYER_SCORE_TEXT_CLASSES[0]);
    } else {
      score.classList.add(PLAYER_SCORE_BORDER_CLASSES[1], PLAYER_SCORE_BG_CLASSES[1], PLAYER_SCORE_TEXT_CLASSES[1]);
    }
  }

  const avatarContainer = document.querySelector<HTMLElement>(`#player${player}-avatar`);
  if (avatarContainer) {
    const avatar = avatarContainer.querySelector<HTMLElement>('[data-player-avatar-inner]');
    if (avatar) {
      avatar.classList.remove(...AVATAR_BORDER_CLASSES);
      avatar.classList.add(role === 'local' ? AVATAR_BORDER_CLASSES[0] : AVATAR_BORDER_CLASSES[1]);
      const initials = avatar.querySelector<HTMLElement>('[data-player-avatar-initials]');
      if (initials) {
        initials.classList.remove(...AVATAR_INITIALS_CLASSES);
        initials.classList.add(role === 'local' ? AVATAR_INITIALS_CLASSES[0] : AVATAR_INITIALS_CLASSES[1]);
      }
    }
  }
}

function applyScoreboardColors(): void {
  const left = document.getElementById('match-score-player');
  const right = document.getElementById('match-score-opponent');

  if (left) {
    left.classList.remove(...SCOREBOARD_COLOR_CLASSES);
    left.classList.add(SCOREBOARD_COLOR_CLASSES[0]);
  }
  if (right) {
    right.classList.remove(...SCOREBOARD_COLOR_CLASSES);
    right.classList.add(SCOREBOARD_COLOR_CLASSES[1]);
  }
}

function applyPlayerNames(
  p1Name: string,
  p1Avatar: string | null,
  p2Name: string,
  p2Avatar: string | null,
  localPlayer: 1 | 2 = 1,
  p1Id?: string | null,
  p2Id?: string | null,
): void {
	const localInfo =
		localPlayer === 1
			? { name: p1Name, avatar: p1Avatar, userId: p1Id ?? undefined }
			: { name: p2Name, avatar: p2Avatar, userId: p2Id ?? undefined };
	const opponentInfo =
		localPlayer === 1
			? { name: p2Name, avatar: p2Avatar, userId: p2Id ?? undefined }
			: { name: p1Name, avatar: p1Avatar, userId: p1Id ?? undefined };

	setScoreboardPlayers(localInfo, opponentInfo, localPlayer);
}

export const playPage = new PlayPage();

window.addEventListener('beforeunload', () => {
	playPage.destroy();
});
