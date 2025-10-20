/**
 * Game Page - Pong Game UI Template
 * 
 * Provides the DOM structure for the Pong game interface.
 * This is a pure UI template - the Play.ts controller handles all game logic.
 * 
 * Features:
 * - Player info display with avatars
 * - Game canvas for rendering
 * - Score display
 * - Game controls container (populated by Controls.ts)
 * - Overlay container for countdown/pause/game-over messages
 * 
 * Architecture:
 * - Game.ts: UI template (this file)
 * - Play.ts: Game controller and orchestrator
 * - features/play/*: Individual game components
 * 
 * Feature: 002-pong-game-integration
 */

import {
  createDiv,
  createElement,
  appendChildren,
} from "../utils/dom";
import { resolveAvatarUrl } from "../utils/avatar";

/**
 * Create avatar with image support or initials fallback
 */
function createAvatar(
  displayName: string,
  avatarUrl: string | null,
  size: string = "h-10 w-10",
  borderColor: string = "border-[#00C8FF]"
): HTMLElement {
  const avatar = createDiv(
    `${size} rounded-full border-2 ${borderColor} bg-[#00C8FF]/10 flex items-center justify-center overflow-hidden`
  );

  const resolvedAvatar = resolveAvatarUrl(avatarUrl);

  const img = document.createElement("img");
  img.src = resolvedAvatar;
  img.alt = displayName;
  img.className = "w-full h-full object-cover";
  img.onerror = () => {
    // Fallback to initials if image fails to load
    img.remove();
    const initials = displayName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
    const text = createElement("span", "text-[#00C8FF] font-semibold text-sm");
    text.textContent = initials;
    avatar.appendChild(text);
  };
  avatar.appendChild(img);

  return avatar;
}

/**
 * Create a score badge
 */
function createBadge(text: string, className: string): HTMLElement {
  const badge = createElement(
    "span",
    `px-3 py-1 rounded-full text-xs font-semibold tracking-wide border ${className}`
  );
  badge.textContent = text;
  return badge;
}

function createInfoPill(id: string, label: string, value: string): HTMLElement {
  const pill = createDiv("flex items-center gap-2 rounded-full border border-[#00C8FF]/25 bg-[#121321]/90 px-4 py-2 text-[11px] uppercase tracking-[0.35em] text-[#E0E0E0]/70");
  pill.id = id;

  const labelEl = createElement("span", "text-[#00C8FF]");
  labelEl.textContent = label;

  const valueEl = createElement("span", "text-[#E0E0E0]");
  valueEl.textContent = value;

  appendChildren(pill, [labelEl, valueEl]);
  return pill;
}

/**
 * Update player info dynamically
 * Called by Play.ts when loading player profiles
 */
export function updatePlayerInfo(
  playerNum: 1 | 2,
  displayName: string,
  avatarUrl: string | null
): void {
  const nameEl = document.getElementById(`player${playerNum}-name`);
  const avatarContainer = document.getElementById(`player${playerNum}-avatar`);
  
  if (nameEl) {
    nameEl.textContent = displayName;
  }
  
  if (avatarContainer) {
    avatarContainer.innerHTML = "";
    avatarContainer.setAttribute('data-player-avatar', String(playerNum));
    const borderColor = playerNum === 1 ? "border-[#00C8FF]" : "border-[#FF008C]";
    const avatarEl = createAvatar(displayName, avatarUrl, "h-12 w-12", borderColor);
    avatarEl.setAttribute('data-player-avatar-inner', String(playerNum));
    const initials = avatarEl.querySelector('span');
    if (initials) {
      initials.setAttribute('data-player-avatar-initials', String(playerNum));
    }
    avatarContainer.appendChild(avatarEl);
  }
}

const matchMetaIdMap = {
  status: 'match-status',
  latency: 'match-latency',
  mode: 'match-mode',
} as const;

export type MatchMetaKey = keyof typeof matchMetaIdMap;

/**
 * Update match meta pill values (status, latency, etc.)
 */
export function updateMatchMeta(meta: MatchMetaKey, value: string): void {
  const elementId = matchMetaIdMap[meta];
  const pill = document.getElementById(elementId);
  if (!pill) {
    return;
  }

  const spans = pill.querySelectorAll('span');
  if (spans.length >= 2) {
    spans[1].textContent = value;
  }
}

/**
 * Draw initial canvas state
 * Shows a loading/waiting screen before game starts
 */
function drawInitialCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Clear canvas
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw center line
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw border
  ctx.strokeStyle = "#00C8FF";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, canvas.width, canvas.height);

  // Show waiting message
  ctx.fillStyle = "#E0E0E0";
  ctx.font = "600 22px 'Inter', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Initializing arena...", canvas.width / 2, canvas.height / 2);
}

/**
 * Create the game page UI
 * Returns the DOM structure - Play.ts will initialize the game logic
 */
export function createGamePage(): HTMLElement {
  const container = createDiv("min-h-screen w-full bg-[#121217] pb-16 pt-20");
  const innerContainer = createDiv("mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 sm:px-6 lg:px-8");

  const header = createDiv("flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between");

  const headingStack = createDiv("space-y-1");
  const headingTitle = createElement("h1", "text-3xl font-bold tracking-tight text-[#E0E0E0] sm:text-4xl");
  headingTitle.textContent = "Arena";
  const headingSubtitle = createElement("p", "text-sm text-[#E0E0E0]/70");
  headingSubtitle.textContent = "Queue up, stay sharp, and keep the same energy as the rest of the dashboard.";
  appendChildren(headingStack, [headingTitle, headingSubtitle]);

  const statusRow = createDiv("flex flex-wrap items-center gap-2");
  statusRow.appendChild(createInfoPill("match-status", "Status", "Waiting"));
  statusRow.appendChild(createInfoPill("match-latency", "Latency", "-- ms"));
  statusRow.appendChild(createInfoPill("match-mode", "Mode", "Ranked"));

  appendChildren(header, [headingStack, statusRow]);

  const grid = createDiv("grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,_2.1fr)_minmax(320px,_1fr)] xl:gap-8");

  // ========================
  // MAIN GAME AREA (LEFT)
  // ========================
  const mainArea = createDiv("flex flex-col gap-6");

  const gameShell = createDiv("overflow-hidden rounded border border-[#00C8FF]/20 bg-[#1a1a24]");
  const gameShellInner = createDiv("flex flex-col");

  const gameHeader = createDiv("flex flex-wrap items-center justify-between gap-4 border-b border-[#00C8FF]/15 px-6 py-5");
  gameHeader.id = "game-header";

  const player1 = createDiv("flex min-w-0 items-center gap-4");
  player1.id = "player1-info";

  const player1Avatar = createDiv("relative");
  player1Avatar.id = "player1-avatar";
  player1Avatar.setAttribute("data-player-avatar", "1");
  const player1AvatarInner = createAvatar("Loading...", null, "h-14 w-14", "border-[#00C8FF]");
  player1AvatarInner.setAttribute("data-player-avatar-inner", "1");
  const player1Initials = player1AvatarInner.querySelector("span");
  if (player1Initials) {
    player1Initials.setAttribute("data-player-avatar-initials", "1");
  }
  player1Avatar.appendChild(player1AvatarInner);
  player1.appendChild(player1Avatar);

  const player1Info = createDiv("flex min-w-0 flex-col gap-1");
  const player1Label = createElement("span", "text-[10px] uppercase tracking-[0.35em] text-[#00C8FF]/60");
  player1Label.id = "player1-label";
  player1Label.textContent = "Player One";
  const player1Name = createElement("p", "truncate text-lg font-semibold text-[#E0E0E0]");
  player1Name.id = "player1-name";
  player1Name.textContent = "Loading...";
  const player1Score = createBadge("0", "px-3 py-1 w-full min-w-[3rem] text-center border-[#00C8FF]/40 bg-[#00C8FF]/10 text-[#00C8FF]");
  player1Score.id = "player1-score";
  appendChildren(player1Info, [player1Label, player1Name, player1Score]);
  player1.appendChild(player1Info);

  const scoreStack = createDiv("flex flex-col items-center gap-1 rounded border border-[#00C8FF]/20 bg-[#121321]/80 px-5 py-3");
  const scoreTitle = createElement("span", "text-[10px] uppercase tracking-[0.5em] text-[#E0E0E0]/40");
  scoreTitle.textContent = "Scoreboard";
  const scoreValue = createDiv("flex items-center gap-3 text-4xl font-bold transition-transform duration-200 lg:text-5xl");
  const scorePlayer = createElement("span", "text-[#00C8FF]");
  scorePlayer.id = "match-score-player";
  scorePlayer.textContent = "0";
  const scoreDash = createElement("span", "text-[#E0E0E0]/50");
  scoreDash.textContent = "-";
  const scoreOpponent = createElement("span", "text-[#FF008C]");
  scoreOpponent.id = "match-score-opponent";
  scoreOpponent.textContent = "0";
  appendChildren(scoreValue, [scorePlayer, scoreDash, scoreOpponent]);
  const scoreSubtext = createElement("span", "text-[10px] uppercase tracking-[0.4em] text-[#E0E0E0]/40");
  scoreSubtext.id = "match-score-target";
  scoreSubtext.textContent = "First to Eleven";
  appendChildren(scoreStack, [scoreTitle, scoreValue, scoreSubtext]);

  const player2 = createDiv("flex min-w-0 items-center gap-4");
  player2.id = "player2-info";

  const player2Info = createDiv("flex min-w-0 flex-col items-end gap-1");
  const player2Label = createElement("span", "text-[10px] uppercase tracking-[0.35em] text-[#FF008C]/60");
  player2Label.id = "player2-label";
  player2Label.textContent = "Player Two";
  const player2Name = createElement("p", "truncate text-lg font-semibold text-[#E0E0E0]");
  player2Name.id = "player2-name";
  player2Name.textContent = "Waiting for opponent...";
  const player2Score = createBadge("0", "px-3 py-1 min-w-[3rem] w-full text-center border-[#FF008C]/40 bg-[#FF008C]/10 text-[#FF008C]");
  player2Score.id = "player2-score";
  appendChildren(player2Info, [player2Label, player2Name, player2Score]);

  const player2Avatar = createDiv("relative");
  player2Avatar.id = "player2-avatar";
  player2Avatar.setAttribute("data-player-avatar", "2");
  const player2AvatarInner = createAvatar("...", null, "h-14 w-14", "border-[#FF008C]");
  player2AvatarInner.setAttribute("data-player-avatar-inner", "2");
  const player2Initials = player2AvatarInner.querySelector("span");
  if (player2Initials) {
    player2Initials.setAttribute("data-player-avatar-initials", "2");
  }
  player2Avatar.appendChild(player2AvatarInner);
  player2.appendChild(player2Info);
  player2.appendChild(player2Avatar);

  appendChildren(gameHeader, [player1, scoreStack, player2]);

  const canvasWrap = createDiv("relative w-full overflow-hidden bg-black border-b border-[#00C8FF]/15 aspect-[16/10] min-h-[320px]");
  const canvas = document.createElement("canvas");
  canvas.id = "game-canvas";
  canvas.width = 1280;
  canvas.height = 800;
  canvas.className = "absolute inset-0 block h-full w-full";

  drawInitialCanvas(canvas);

  const overlayContainer = createDiv("pointer-events-none absolute inset-0 z-20 flex items-center justify-center");
  overlayContainer.id = "game-overlay";

  const flowOverlay = createDiv("absolute inset-0 z-30 hidden items-center justify-center bg-[#070910]/80 px-6");
  flowOverlay.id = "game-flow-overlay";

  appendChildren(canvasWrap, [canvas, overlayContainer, flowOverlay]);

  const controlsPanel = createDiv("border-t border-[#00C8FF]/15 bg-[#121321]/80 px-6 py-5");
  const controls = createDiv("min-h-[64px] flex flex-wrap items-center justify-center gap-3");
  controls.id = "game-controls";
  controlsPanel.appendChild(controls);

  appendChildren(gameShellInner, [gameHeader, canvasWrap, controlsPanel]);
  gameShell.appendChild(gameShellInner);


  const controlsCard = createDiv("space-y-3 rounded border border-[#00C8FF]/15 bg-[#1a1a24] p-6");
  const controlsTitle = createElement("h3", "text-xs uppercase tracking-[0.35em] text-[#E0E0E0]/60");
  controlsTitle.textContent = "Controls";
  const controlGrid = createDiv("grid grid-cols-1 gap-3 text-[#E0E0E0]/70");
  controlGrid.innerHTML = `
    <div class="rounded border border-[#00C8FF]/25 bg-[#121216]/80 p-4">
      <p class="mb-1 text-[11px] uppercase tracking-wide text-[#00C8FF]">Keyboard</p>
      <p class="text-sm text-[#E0E0E0]/80">Arrow Keys or W/S to move</p>
    </div>
    <div class="rounded border border-[#00C8FF]/20 bg-[#121216]/80 p-4">
      <p class="mb-1 text-[11px] uppercase tracking-wide text-[#E0E0E0]/60">Tips</p>
      <p class="text-sm text-[#E0E0E0]/80">Hit the ball near paddle edges to curve shots. Momentum carries into rallies.</p>
    </div>
  `;
  appendChildren(controlsCard, [controlsTitle, controlGrid]);

  appendChildren(mainArea, [gameShell]);

  // ========================
  // SIDEBAR
  // ========================
  const sidebar = createDiv("flex flex-col gap-6");

  const matchDetailsCard = createDiv("overflow-hidden rounded border border-[#00C8FF]/15 bg-[#1a1a24]");
  const detailsHeader = createDiv("flex items-center justify-between border-b border-[#00C8FF]/15 px-5 py-4");
  const detailsTitle = createElement("h3", "text-sm font-semibold tracking-wide text-[#E0E0E0]");
  detailsTitle.textContent = "Match Timeline";
  const detailsBadge = createBadge("LIVE", "border-[#FF008C]/30 bg-[#1b1425]/70 text-[#FF008C]");
  appendChildren(detailsHeader, [detailsTitle, detailsBadge]);

  const timeline = createElement("ul", "space-y-4 px-5 py-4 text-sm text-[#E0E0E0]/70");
  timeline.innerHTML = `
    <li class="flex gap-3">
      <span class="mt-1 h-2 w-2 rounded-full bg-[#00C8FF]"></span>
      <div>
        <p class="font-medium text-[#E0E0E0]">Practice Mode</p>
        <p class="text-sm text-[#E0E0E0]/60">Solo warmup against the adaptive bot. Perfect for learning the pacing and working on angles.</p>
      </div>
    </li>
    <li class="flex gap-3">
      <span class="mt-1 h-2 w-2 rounded-full bg-[#00C8FF]/70"></span>
      <div>
        <p class="font-medium text-[#E0E0E0]">Local Versus</p>
        <p class="text-sm text-[#E0E0E0]/60">Two players share one screen: Player 1 uses W/S, Player 2 uses Arrow keys. Great for couch rivalries.</p>
      </div>
    </li>
    <li class="flex gap-3">
      <span class="mt-1 h-2 w-2 rounded-full bg-[#FF008C]"></span>
      <div>
        <p class="font-medium text-[#E0E0E0]">Multiplayer</p>
        <p class="text-sm text-[#E0E0E0]/60">Challenge friends or quickmatch online. We handle invites, countdown, and latency so you can focus on the rally.</p>
      </div>
    </li>
  `;

  appendChildren(matchDetailsCard, [detailsHeader, timeline]);

  sidebar.appendChild(matchDetailsCard);
  sidebar.appendChild(controlsCard);

  appendChildren(grid, [mainArea, sidebar]);
  appendChildren(innerContainer, [header, grid]);
  container.appendChild(innerContainer);

  return container;
}
