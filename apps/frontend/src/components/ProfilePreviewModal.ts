import { createDiv, createElement, createButton, appendChildren } from "../utils/dom";
import { createIcon } from "../utils/icons";
import { resolveAvatarUrl } from "../utils/avatar";
import {
  getPublicProfile,
  getUserStats,
  type UserProfile,
  type UserStats,
  type RecentMatch,
} from "../lib/api-client";

export interface ProfilePreviewOptions {
  userId: string;
  onClose?: () => void;
  onOpenDM?: (userId: string, profile: UserProfile) => void;
}

export interface ProfilePreviewHandle {
  close: () => void;
}

const activeModalKey = "profile-preview-modal";

export async function showProfilePreviewModal(options: ProfilePreviewOptions): Promise<ProfilePreviewHandle> {
  const existing = document.querySelector<HTMLElement>(`[data-modal-key="${activeModalKey}"]`);
  if (existing) {
    existing.remove();
  }

  const overlay = createDiv(
    "fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
  );
  overlay.dataset.modalKey = activeModalKey;

  const modal = createDiv(
    "w-full max-w-4xl rounded-xl border border-[#00C8FF]/40 bg-[#10121a] shadow-[0_0_45px_rgba(0,200,255,0.25)] overflow-hidden flex flex-col"
  );

  const header = createDiv("flex items-center justify-between border-b border-[#00C8FF]/20 px-6 py-4");
  const headerTitle = createElement("h3", "text-lg font-semibold text-[#E0E0E0]");
  headerTitle.textContent = "Player Profile";
  const closeBtn = createButton(
    "",
    "h-9 w-9 rounded-full border border-[#00C8FF]/30 text-[#00C8FF] hover:border-[#00C8FF] hover:bg-[#00C8FF]/10 flex items-center justify-center"
  );
  closeBtn.appendChild(createIcon("circle", "h-4 w-4"));

  appendChildren(header, [headerTitle, closeBtn]);

  const body = createDiv("px-6 py-6 space-y-6 max-h-[80vh] overflow-y-auto");

  const loadingState = createDiv("flex items-center justify-center py-10");
  const loadingText = createElement("p", "text-sm text-[#E0E0E0]/70");
  loadingText.textContent = "Loading player details...";
  loadingState.appendChild(loadingText);

  body.appendChild(loadingState);

  appendChildren(modal, [header, body]);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  let closed = false;

  const cleanup = () => {
    if (closed) {
      return;
    }
    closed = true;
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
    options.onClose?.();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      cleanup();
    }
  };

  closeBtn.addEventListener("click", cleanup);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      cleanup();
    }
  });
  document.addEventListener("keydown", onKeyDown);

  try {
    const [profile, stats] = await Promise.all([
      getPublicProfile(options.userId),
      getUserStats(options.userId, { limit: 5 }),
    ]);

    renderProfileSummary(body, profile, stats, options);
  } catch (error) {
    console.error("Failed to load profile preview:", error);
    body.innerHTML = "";
    const errorState = createDiv("py-10 text-center space-y-3");
    const title = createElement("h4", "text-lg font-semibold text-[#FF008C]");
    title.textContent = "Unable to load profile";
    const message = createElement("p", "text-sm text-[#E0E0E0]/70");
    message.textContent =
      error instanceof Error ? error.message : "An unexpected error occurred while loading this profile.";
    const closeBtn = createButton(
      "Close",
      "inline-flex items-center gap-2 rounded border border-[#00C8FF]/50 px-4 py-2 text-sm text-[#00C8FF] hover:border-[#00C8FF]"
    );
    closeBtn.appendChild(createIcon("x", "h-4 w-4"));
    closeBtn.addEventListener("click", cleanup);
    appendChildren(errorState, [title, message, closeBtn]);
    body.appendChild(errorState);
  }

  return {
    close: cleanup,
  };
}

function renderProfileSummary(
  container: HTMLElement,
  profile: UserProfile,
  stats: UserStats,
  options: ProfilePreviewOptions
): void {
  container.innerHTML = "";

  const headerCard = createDiv("flex flex-col gap-4 rounded border border-[#00C8FF]/20 bg-[#121421] px-5 py-5");
  const identityRow = createDiv("flex flex-col gap-4 md:flex-row md:items-center md:justify-between");

  const left = createDiv("flex items-center gap-4");
  const avatar = createDiv(
    "h-16 w-16 rounded-full border-2 border-[#00C8FF]/70 bg-[#0b0e19] flex items-center justify-center overflow-hidden text-xl text-[#00C8FF]"
  );
  const resolvedAvatar = resolveAvatarUrl(profile.avatarUrl);
  const img = document.createElement("img");
  img.src = resolvedAvatar;
  img.alt = profile.displayName;
  img.className = "h-full w-full object-cover";
  img.onerror = () => {
    img.remove();
    avatar.textContent = profile.displayName.substring(0, 2).toUpperCase();
  };
  avatar.appendChild(img);

  const titleStack = createDiv("space-y-1");
  const name = createElement("h4", "text-xl font-semibold text-[#E0E0E0]");
  name.textContent = profile.displayName;
  const meta = createElement("p", "text-xs uppercase tracking-[0.35em] text-[#8D93B5]");
  meta.textContent = `Member since ${formatDate(profile.createdAt)}`;
  appendChildren(titleStack, [name, meta]);

  appendChildren(left, [avatar, titleStack]);

  const actions = createDiv("flex items-center gap-2");
  if (options.onOpenDM) {
    const dmBtn = createButton(
      "Open Direct Message",
      "inline-flex items-center gap-2 rounded border border-[#00C8FF]/60 bg-[#00C8FF]/10 px-4 py-2 text-sm text-[#00C8FF] hover:border-[#00C8FF]"
    );
    dmBtn.appendChild(createIcon("messageSquare", "h-4 w-4"));
    dmBtn.addEventListener("click", () => options.onOpenDM?.(profile.userId, profile));
    actions.appendChild(dmBtn);
  }

  appendChildren(identityRow, [left, actions]);

  const statsGrid = createDiv("grid gap-3 sm:grid-cols-2 lg:grid-cols-4");
  const totalGames = stats.wins + stats.losses;
  const winRate = totalGames > 0 ? Math.round((stats.wins / totalGames) * 100) : 0;
  const streak = stats.streak;

  const metrics = [
    { label: "Wins", value: String(stats.wins) },
    { label: "Losses", value: String(stats.losses) },
    { label: "Win Rate", value: `${winRate}%` },
    { label: "Streak", value: streak > 0 ? `${streak} 🔥` : String(streak) },
  ];

  metrics.forEach((metric) => {
    const card = createDiv("rounded border border-[#00C8FF]/15 bg-[#0f121d] px-4 py-3");
    const label = createElement("p", "text-[11px] uppercase tracking-[0.35em] text-[#8D93B5]");
    label.textContent = metric.label;
    const value = createElement("p", "mt-1 text-lg font-semibold text-[#E0E0E0]");
    value.textContent = metric.value;
    appendChildren(card, [label, value]);
    statsGrid.appendChild(card);
  });

  appendChildren(headerCard, [identityRow, statsGrid]);

  const recentSection = createDiv("space-y-3");
  const recentHeader = createDiv("flex items-center justify-between");
  const recentTitle = createElement("h5", "text-sm font-semibold text-[#E0E0E0]");
  recentTitle.textContent = "Recent Matches";
  const recentHint = createElement("span", "text-[11px] uppercase tracking-[0.35em] text-[#8D93B5]");
  recentHint.textContent = stats.recent.length > 0 ? `${stats.recent.length} results` : "No matches yet";
  appendChildren(recentHeader, [recentTitle, recentHint]);

  const recentList = createDiv("space-y-2");
  if (stats.recent.length === 0) {
    const empty = createElement("p", "text-xs text-[#8D93B5]");
    empty.textContent = "This player has not played any matches yet.";
    recentList.appendChild(empty);
  } else {
    stats.recent.slice(0, 5).forEach((match) => {
      recentList.appendChild(renderRecentMatch(match, profile));
    });
  }

  appendChildren(recentSection, [recentHeader, recentList]);

  appendChildren(container, [headerCard, recentSection]);
}

function renderRecentMatch(match: RecentMatch, profile: UserProfile): HTMLElement {
  const card = createDiv("rounded border border-[#00C8FF]/10 bg-[#0f121d] px-4 py-3 space-y-1");
  const title = createDiv("flex items-center justify-between text-sm text-[#E0E0E0]");
  const result = match.outcome === "win" ? "Won" : match.outcome === "loss" ? "Lost" : "Played";
  title.textContent = `${profile.displayName} ${result}`;

  const score = createElement("p", "text-xs text-[#8D93B5]");
  score.textContent = `${match.p1Score} - ${match.p2Score}`;

  const timestamp = createElement("p", "text-[11px] uppercase tracking-[0.35em] text-[#5F6482]");
  timestamp.textContent = formatDate(match.ts);

  appendChildren(card, [title, score, timestamp]);
  return card;
}

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}
