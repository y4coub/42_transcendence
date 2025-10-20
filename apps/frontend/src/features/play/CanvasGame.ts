/**
 * Canvas Game Renderer
 *
 * Renders the Pong game at 60 fps using requestAnimationFrame
 * Draws paddles, ball, scoreboard, and latency indicator
 * Uses normalized coordinates (0.0-1.0) that scale to canvas size
 *
 * Feature: 002-pong-game-integration
 */

import type { InterpolatedState } from './state';

interface RenderOptions {
	playerId?: string;
	p1Id?: string;
	p2Id?: string;
	latency?: number;
}

export class CanvasGameRenderer {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private animationFrameId: number | null = null;
	private fps = 0;
	private fpsCounter = { frames: 0, lastTime: 0 };
	private currentState: InterpolatedState | null = null;
	private options: RenderOptions = {};
	private resizeObserver: ResizeObserver | null = null;
	private logicalWidth = 0;
	private logicalHeight = 0;
	private placeholderMessage: string | null = 'Waiting for game state...';

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;

		const ctx = canvas.getContext('2d');
		if (!ctx) {
			throw new Error('Could not get 2D context from canvas');
		}
		this.ctx = ctx;
		this.ctx.lineCap = 'butt';
		this.ctx.lineJoin = 'miter';
		this.ctx.imageSmoothingEnabled = true;
		this.ctx.imageSmoothingQuality = 'medium';

		this.canvas.style.display = 'block';
		this.canvas.style.width = '100%';
		this.canvas.style.height = '100%';

		this.resizeCanvas();
		if (typeof ResizeObserver !== 'undefined') {
			this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
			this.resizeObserver.observe(this.canvas);
		}
		window.addEventListener('resize', this.resizeCanvas);
	}

	/**
	 * Start the render loop
	 */
	start(): void {
		if (this.animationFrameId !== null) {
			return; // Already running
		}

		this.animationFrameId = requestAnimationFrame(this.render);
	}

	/**
	 * Stop the render loop
	 */
	stop(): void {
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
	}

	/**
	 * Update the game state to render
	 */
	setState(state: InterpolatedState | null): void {
		this.currentState = state;
		if (state) {
			this.placeholderMessage = null;
		} else if (!this.placeholderMessage) {
			this.placeholderMessage = 'Waiting for game state...';
		}
	}

	/**
	 * Update render options
	 */
	setOptions(options: RenderOptions): void {
		this.options = { ...this.options, ...options };
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		this.stop();
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		window.removeEventListener('resize', this.resizeCanvas);
	}

	private render = (timestamp: number): void => {
		const { width, height } = this.getCanvasSize();

		if (width === 0 || height === 0) {
			this.animationFrameId = requestAnimationFrame(this.render);
			return;
		}

		this.drawBackdrop(width, height);

		if (this.currentState) {
			this.drawGame(this.currentState, width, height);
		} else {
			this.drawWaitingMessage(width, height, this.placeholderMessage ?? 'Waiting for game state...');
		}

		if (this.options.latency !== undefined) {
			this.drawLatencyIndicator(this.options.latency, width);
		}

		this.drawFpsCounter(width);
		this.updateFpsCounter(timestamp);

		this.animationFrameId = requestAnimationFrame(this.render);
	};

	private resizeCanvas = (): void => {
		let rect = this.canvas.getBoundingClientRect();

		if (rect.width === 0 || rect.height === 0) {
			const parentRect = this.canvas.parentElement?.getBoundingClientRect();
			if (parentRect && parentRect.width > 0 && parentRect.height > 0) {
				rect = parentRect;
			} else {
				requestAnimationFrame(this.resizeCanvas);
				return;
			}
		}

		this.logicalWidth = rect.width;
		this.logicalHeight = rect.height;

		const dpr = window.devicePixelRatio || 1;
		const width = Math.max(1, Math.round(rect.width * dpr));
		const height = Math.max(1, Math.round(rect.height * dpr));

		if (this.canvas.width !== width || this.canvas.height !== height) {
			this.canvas.width = width;
			this.canvas.height = height;
		}

		this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		this.ctx.imageSmoothingEnabled = true;
		this.ctx.imageSmoothingQuality = 'high';

		if (!this.currentState && this.placeholderMessage) {
			this.drawBackdrop(this.logicalWidth, this.logicalHeight);
			this.drawWaitingMessage(this.logicalWidth, this.logicalHeight, this.placeholderMessage);
		}
	};

	private getCanvasSize(): { width: number; height: number } {
		const width = this.logicalWidth || this.canvas.clientWidth || this.canvas.width;
		const height = this.logicalHeight || this.canvas.clientHeight || this.canvas.height;
		return { width, height };
	}

	private drawBackdrop(width: number, height: number): void {
		this.ctx.clearRect(0, 0, width, height);
		this.ctx.fillStyle = '#000000';
		this.ctx.fillRect(0, 0, width, height);
	}

	/**
	 * Update FPS counter
	 */
	private updateFpsCounter(timestamp: number): void {
		this.fpsCounter.frames++;

		if (timestamp - this.fpsCounter.lastTime >= 1000) {
			this.fps = this.fpsCounter.frames;
			this.fpsCounter.frames = 0;
			this.fpsCounter.lastTime = timestamp;
		}
	}

	/**
	 * Draw the game (paddles, ball, score)
	 */
	private drawGame(state: InterpolatedState, width: number, height: number): void {
		const paddleWidth = 0.02;
		const paddleHeight = 0.15;
		const ballSize = 0.02;

		const toScreenX = (x: number) => x * width;
		const toScreenY = (y: number) => y * height;

		this.ctx.save();
		this.ctx.strokeStyle = 'rgba(0,200,255,0.28)';
		this.ctx.lineWidth = 2;
		this.ctx.setLineDash([14, 14]);
		this.ctx.beginPath();
		this.ctx.moveTo(width / 2, 0);
		this.ctx.lineTo(width / 2, height);
		this.ctx.stroke();
		this.ctx.restore();

		const isP1 = this.options.playerId === this.options.p1Id;
		const yourColor = '#00C8FF';
		const opponentColor = '#FF008C';

		const leftColor = isP1 ? yourColor : opponentColor;
		const rightColor = isP1 ? opponentColor : yourColor;

		const p1X = toScreenX(0);
		const p1Y = toScreenY(state.p1.y - paddleHeight / 2);
		const p1Width = Math.max(6, toScreenX(paddleWidth));
		const p1Height = toScreenY(paddleHeight);

		this.ctx.fillStyle = leftColor;
		this.ctx.fillRect(p1X, p1Y, p1Width, p1Height);

		const p2X = toScreenX(1 - paddleWidth);
		const p2Y = toScreenY(state.p2.y - paddleHeight / 2);
		const p2Width = Math.max(6, toScreenX(paddleWidth));
		const p2Height = toScreenY(paddleHeight);

		this.ctx.fillStyle = rightColor;
		this.ctx.fillRect(p2X, p2Y, p2Width, p2Height);

		this.ctx.fillStyle = '#ffffff';
		const ballX = toScreenX(state.ball.x - ballSize / 2);
		const ballY = toScreenY(state.ball.y - ballSize / 2);
		const ballWidth = toScreenX(ballSize);
		const ballHeight = toScreenY(ballSize);
		this.ctx.fillRect(ballX, ballY, ballWidth, ballHeight);

		this.ctx.fillStyle = '#E0E0E0';
		const scoreFontSize = Math.max(32, Math.min(56, width * 0.06));
		this.ctx.font = `600 ${scoreFontSize}px "JetBrains Mono", monospace`;
		this.ctx.textAlign = 'center';
		this.ctx.textBaseline = 'top';
		const scoreY = Math.max(24, height * 0.05);
		this.ctx.fillText(`${state.score.p1}`, width / 4, scoreY);
		this.ctx.fillText(`${state.score.p2}`, (width * 3) / 4, scoreY);

		this.ctx.font = '14px "JetBrains Mono", monospace';
		this.ctx.fillStyle = yourColor;
		if (isP1) {
			this.ctx.textAlign = 'left';
			this.ctx.fillText('YOU', 24, height - 32);
		} else {
			this.ctx.textAlign = 'right';
			this.ctx.fillText('YOU', width - 24, height - 32);
		}
		this.ctx.restore();
	}

	/**
	 * Draw waiting message
	 */
	private drawWaitingMessage(width: number, height: number, message: string): void {
		this.ctx.save();
		this.ctx.fillStyle = 'rgba(224,224,224,0.85)';
		this.ctx.font = '20px "Inter", sans-serif';
		this.ctx.textAlign = 'center';
		this.ctx.textBaseline = 'middle';
		this.ctx.fillText(message, width / 2, height / 2);
		this.ctx.restore();
	}

	/**
	 * Draw latency indicator overlay
	 */
	private drawLatencyIndicator(latency: number, width: number): void {
		const value = Math.max(0, Math.round(latency));
		const color = value < 50 ? '#00C8FF' : latency < 100 ? '#F5A623' : '#FF4D4F';

		this.ctx.save();
		this.ctx.textAlign = 'right';
		this.ctx.textBaseline = 'top';
		this.ctx.font = '12px "JetBrains Mono", monospace';
		this.ctx.fillStyle = color;
		this.ctx.fillText(`${value} ms`, width - 12, 12);
		this.ctx.restore();
	}

	/**
	 * Draw FPS counter
	 */
	private drawFpsCounter(width: number): void {
		const color = this.fps >= 55 ? '#00FF99' : this.fps >= 30 ? '#F5A623' : '#FF4D4F';

		this.ctx.save();
		this.ctx.textAlign = 'right';
		this.ctx.textBaseline = 'top';
		this.ctx.font = '12px "JetBrains Mono", monospace';
		this.ctx.fillStyle = color;
		this.ctx.fillText(`${Math.round(this.fps)} fps`, width - 12, 28);
		this.ctx.restore();
	}

	showPlaceholder(message: string): void {
		this.placeholderMessage = message;
		const { width, height } = this.getCanvasSize();
		if (width === 0 || height === 0) {
			requestAnimationFrame(() => this.showPlaceholder(message));
			return;
		}
		this.drawBackdrop(width, height);
		this.drawWaitingMessage(width, height, message);
	}
}

