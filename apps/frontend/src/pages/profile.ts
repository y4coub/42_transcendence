import {
  createDiv,
  createElement,
  createButton,
  createInput,
  createLabel,
  appendChildren,
} from "../utils/dom";
import { profileState, type ProfileState } from "../features/profile/state";
import { getUser, getUserId, setUser } from "../lib/auth";
import {
  getUserProfile,
  updateUserProfile,
  type UserProfile,
  type UserStats,
  type RecentMatch,
} from "../lib/api-client";
import { showError, showSuccess, showPrompt } from "../components/Modal";

let currentProfile: UserProfile | null = null;
let currentStats: UserStats | null = null;
let globalRank: number | null = null;
let matchesRenderToken = 0;
let profileStateUnsubscribe: (() => void) | null = null;
let viewingOwnProfile = true;
let profileUserId: string | null = null;

const opponentNameCache = new Map<string, { name: string; avatarUrl: string | null }>();

function updateProfileDisplay(profile: UserProfile): void {
  currentProfile = profile;
  if (viewingOwnProfile) {
    setUser({ id: profile.userId, email: profile.email, displayName: profile.displayName });
  }

  const displayName = profile.displayName;
  document.title = `${displayName} · Profile`;

  const avatarElements = document.querySelectorAll('[data-profile-avatar]');
  avatarElements.forEach((node) => {
    const container = node as HTMLElement;
    container.innerHTML = '';
    const initials = getInitials(displayName);

    if (profile.avatarUrl) {
      const img = document.createElement('img');
      img.src = profile.avatarUrl;
      img.alt = displayName;
      img.className = 'w-full h-full object-cover';
      img.onerror = () => {
        img.remove();
        const fallback = createElement('span', 'text-[#00C8FF] text-4xl');
        fallback.textContent = initials;
        container.appendChild(fallback);
      };
      container.appendChild(img);
    } else {
      const fallback = createElement('span', 'text-[#00C8FF] text-4xl');
      fallback.textContent = initials;
      container.appendChild(fallback);
    }
  });

  const nameElements = document.querySelectorAll('[data-profile-name]');
  nameElements.forEach((el) => {
    el.textContent = displayName;
  });

  const memberSinceElements = document.querySelectorAll('[data-profile-joined]');
  const memberSince = formatMemberSince(profile.createdAt);
  memberSinceElements.forEach((el) => {
    el.textContent = `Member since ${memberSince}`;
  });
}

function handleProfileStatsUpdate(stats: UserStats): void {
  currentStats = stats;
  updateProfileStats(stats);
}

function handleGlobalRankUpdate(rank: number | null): void {
  globalRank = rank;
  if (currentStats) {
    updateProfileStats(currentStats);
  }
}

async function loadProfileData(userId: string): Promise<void> {
  if (profileStateUnsubscribe) {
    profileStateUnsubscribe();
  }

  profileStateUnsubscribe = profileState.subscribe((state) => {
    updateSecuritySummary(state);

    if (state.profileLoading === 'success' && state.profile) {
      updateProfileDisplay(state.profile);
    }

    if (state.profileLoading === 'error' && state.profileError) {
      showErrorMessage(state.profileError);
    }

    if (state.statsLoading === 'success' && state.stats) {
      handleGlobalRankUpdate(state.globalRank);
      handleProfileStatsUpdate(state.stats);
    }

    if (state.statsLoading === 'error' && state.statsError) {
      showErrorMessage(state.statsError);
    }
  });

  try {
    showLoadingSpinner();
    await profileState.loadAll(userId, { includeSecurity: viewingOwnProfile });
    const state = profileState.getState();
    if (state.profile) {
      updateProfileDisplay(state.profile);
    }
    if (state.stats) {
      handleGlobalRankUpdate(state.globalRank);
      handleProfileStatsUpdate(state.stats);
    }
    updateSecuritySummary(state);
  } catch (error) {
    console.error('Failed to load profile data:', error);
    const message = error instanceof Error ? error.message : 'Failed to load profile data';
    showErrorMessage(message);
  } finally {
    hideLoadingSpinner();
  }
}

function updateProfileStats(stats: UserStats): void {
  const totalGames = stats.wins + stats.losses;
  const winRate = totalGames > 0 ? Math.round((stats.wins / totalGames) * 100) : 0;
  const estimatedElo = computeEstimatedElo(stats);

  updateStatValue('[data-stat-elo]', String(estimatedElo));
  updateStatValue('[data-stat-rank]', globalRank ? `#${globalRank}` : 'Unranked');
  updateStatValue('[data-stat-level]', String(Math.max(1, Math.floor(totalGames / 10) + 1)));
  updateStatValue('[data-stat-winrate]', `${winRate}%`);
  updateStatValue('[data-stat-wins]', String(stats.wins));
  updateStatValue('[data-stat-losses]', String(stats.losses));
  updateStatValue('[data-stat-streak]', String(stats.streak));
  updateStatValue('[data-stat-games]', String(totalGames));

  const recentMatches = stats.recent ?? [];
  const recentCount = recentMatches.length;
  const recentWins = recentMatches.filter((match) => match.outcome === 'win').length;
  const recentLosses = recentCount - recentWins;
  const avgPointsFor =
    recentCount > 0
      ? (recentMatches.reduce((sum, match) => sum + match.p1Score, 0) / recentCount)
      : 0;
  const avgPointsAgainst =
    recentCount > 0
      ? (recentMatches.reduce((sum, match) => sum + match.p2Score, 0) / recentCount)
      : 0;

  let bestWinMargin = Number.NEGATIVE_INFINITY;
  let narrowLossMargin = Number.POSITIVE_INFINITY;
  recentMatches.forEach((match) => {
    const margin = match.p1Score - match.p2Score;
    if (match.outcome === 'win') {
      bestWinMargin = Math.max(bestWinMargin, margin);
    } else {
      narrowLossMargin = Math.min(narrowLossMargin, Math.abs(margin));
    }
  });

  const recentWinRate = recentCount > 0 ? Math.round((recentWins / recentCount) * 100) : 0;

  updateInsightValue('[data-insight-recent-record]', recentCount > 0 ? `${recentWins}W · ${recentLosses}L` : 'No recent games');
  updateInsightValue('[data-insight-points-for]', `${avgPointsFor.toFixed(1)} pts`);
  updateInsightValue('[data-insight-points-against]', `${avgPointsAgainst.toFixed(1)} pts`);
  updateInsightValue('[data-insight-best-margin]', bestWinMargin > Number.NEGATIVE_INFINITY ? `+${bestWinMargin}` : '—');
  updateInsightValue('[data-insight-closest-loss]', narrowLossMargin < Number.POSITIVE_INFINITY ? `-${narrowLossMargin}` : '—');
  updateInsightValue(
    '[data-insight-differential]',
    recentCount > 0 ? `${(avgPointsFor - avgPointsAgainst).toFixed(1)} diff` : '—'
  );
  updateInsightValue(
    '[data-insight-recent-summary]',
    recentCount > 0 ? `Won ${recentWins} of last ${recentCount}` : 'Get a match in to build your streak.'
  );
  updateInsightValue(
    '[data-insight-points-for-helper]',
    recentCount > 0 ? `Across last ${recentCount} matches.` : 'Complete more matches to populate this insight.'
  );
  updateInsightValue(
    '[data-insight-points-against-helper]',
    recentCount > 0 ? `Across last ${recentCount} matches.` : 'Complete more matches to populate this insight.'
  );
  updateInsightValue(
    '[data-insight-differential-helper]',
    recentCount > 0 ? 'Positive means you outscored opponents on average.' : 'No data yet — every match counts!'
  );
  updateInsightValue(
    '[data-insight-best-margin-helper]',
    bestWinMargin > Number.NEGATIVE_INFINITY ? 'Largest goal difference in a win.' : 'Secure a win to see your best margin.'
  );
  updateInsightValue(
    '[data-insight-closest-loss-helper]',
    narrowLossMargin < Number.POSITIVE_INFINITY ? 'Smallest deficit in a recent loss.' : 'Avoided losses so far — keep it up!'
  );

  const trendBar = document.querySelector('[data-insight-recent-bar]') as HTMLElement | null;
  if (trendBar) {
    const effectiveRate = recentCount > 0 ? recentWinRate : 0;
    trendBar.style.width = `${effectiveRate}%`;
    trendBar.title = `Recent win rate: ${effectiveRate}%`;
  }

  void updateRecentMatches(stats.recent);
}

function updateStatValue(selector: string, value: string): void {
  const elements = document.querySelectorAll(selector);
  elements.forEach((el) => {
    el.textContent = value;
  });
}

function updateInsightValue(selector: string, value: string): void {
  const elements = document.querySelectorAll(selector);
  elements.forEach((el) => {
    el.textContent = value;
  });
}

function getInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return displayName.substring(0, 2).toUpperCase();
}

function formatMemberSince(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date);
  } catch {
    return 'Unknown';
  }
}

function computeEstimatedElo(stats: UserStats): number {
  const base = 1000 + stats.wins * 25 - stats.losses * 20;
  return Math.max(0, Math.round(base));
}

function updateSecuritySummary(snapshot?: ProfileState): void {
  const state = snapshot ?? profileState.getState();

  const badge = document.querySelector('[data-security-badge]') as HTMLElement | null;
  const detail = document.querySelector('[data-security-detail]') as HTMLElement | null;

  if (!badge || !detail) {
    return;
  }

  if (!viewingOwnProfile) {
    badge.textContent = 'Private';
    badge.className = 'inline-flex items-center rounded px-3 py-1 text-sm border border-[#2A2E4A]/60 text-[#8D93B5] bg-[#1a1d2d]';
    detail.textContent = 'Security settings are only visible to the account owner.';
    return;
  }

  if (state.twoFactorLoading === 'loading' && !state.twoFactor && !state.twoFactorEnrollment) {
    badge.textContent = 'Checking...';
    badge.className = 'inline-flex items-center rounded px-3 py-1 text-sm border border-[#E0E0E0]/30 text-[#E0E0E0]/70 bg-[#121217]';
    detail.textContent = 'Fetching the latest two-factor authentication status.';
    return;
  }

  const status = state.twoFactor?.status ?? 'disabled';
  const enrollment = state.twoFactorEnrollment;

  let badgeText = 'Disabled';
  let badgeClass = 'inline-flex items-center rounded px-3 py-1 text-sm border border-[#FF008C]/40 text-[#FF008C] bg-[#FF008C]/10';
  let detailText = 'Protect your account by enabling two-factor authentication.';

  if (status === 'active') {
    badgeText = 'Enabled';
    badgeClass = 'inline-flex items-center rounded px-3 py-1 text-sm border border-[#00C8FF]/40 text-[#00C8FF] bg-[#00C8FF]/10';
    detailText = state.twoFactor?.lastVerifiedAt
      ? `Last verified on ${new Date(state.twoFactor.lastVerifiedAt).toLocaleString()}`
      : 'Two-factor authentication is active on your account.';
  } else if (status === 'pending') {
    badgeText = 'Pending';
    badgeClass = 'inline-flex items-center rounded px-3 py-1 text-sm border border-[#F59E0B]/40 text-[#F59E0B] bg-[#F59E0B]/10';
    detailText = enrollment
      ? `Finish setup before ${new Date(enrollment.expiresAt).toLocaleTimeString()}.`
      : 'Finish enrollment to secure your account.';
  }

  badge.textContent = badgeText;
  badge.className = badgeClass;
  detail.textContent = detailText;
}

function showLoadingSpinner(): void {
  const spinner = document.querySelector('[data-loading-spinner]');
  if (spinner) {
    spinner.classList.remove('hidden');
  }
}

function hideLoadingSpinner(): void {
  const spinner = document.querySelector('[data-loading-spinner]');
  if (spinner) {
    spinner.classList.add('hidden');
  }
}

function showErrorMessage(message: string): void {
  // TODO: Implement toast notification system (Phase 10: T097)
  console.error('Profile Error:', message);
  showError('Profile Error', message);
}

function showSuccessMessage(message: string): void {
  // TODO: Implement toast notification system (Phase 10: T097)
  console.log('Profile Success:', message);
  showSuccess('Success', message);
}

async function updateRecentMatches(matches: RecentMatch[]): Promise<void> {
  const historyList = document.querySelector('[data-match-history]');
  if (!historyList) return;

  const token = ++matchesRenderToken;
  historyList.innerHTML = '';

  if (matches.length === 0) {
    const emptyState = createDiv('text-center py-8 text-[#E0E0E0]/60');
    emptyState.textContent = 'No matches played yet';
    historyList.appendChild(emptyState);
    return;
  }

  try {
    const loadingState = createDiv('text-center py-8 text-[#E0E0E0]/60');
    loadingState.textContent = 'Loading match history...';
    historyList.appendChild(loadingState);

    const enriched = await Promise.all(
      matches.map(async (match) => {
        const opponent = await resolveOpponentInfo(match.opponentId);
        const initials = getInitials(opponent.name);
        return { match, opponent, initials };
      })
    );

    if (token !== matchesRenderToken) {
      return;
    }

    historyList.innerHTML = '';

    enriched.forEach(({ match, opponent, initials }) => {
      const gameItem = createDiv(
        "flex items-center justify-between p-4 rounded border border-[#00C8FF]/20 bg-[#121217] hover:border-[#00C8FF]/50 transition-colors"
      );

      const leftSide = createDiv("flex items-center gap-4");
      leftSide.appendChild(
        createAvatar(initials, "h-12 w-12", opponent.avatarUrl)
      );

      const gameInfo = createDiv();
      const nameEl = createElement("p", "text-[#E0E0E0]");
      nameEl.textContent = opponent.name;
      const timeEl = createElement("p", "text-[#E0E0E0]/60");
      timeEl.textContent = formatRelativeTime(match.ts);
      appendChildren(gameInfo, [nameEl, timeEl]);
      leftSide.appendChild(gameInfo);

      const rightSide = createDiv("flex items-center gap-6");

      const scoreDiv = createDiv("text-center");
      const scoreLabel = createElement("p", "text-[#E0E0E0]/60");
      scoreLabel.textContent = "Score";
      const scoreValue = createElement("p", "text-[#E0E0E0]");
      scoreValue.textContent = `${match.p1Score}-${match.p2Score}`;
      appendChildren(scoreDiv, [scoreLabel, scoreValue]);

      const badge = createBadge(
        match.outcome.toUpperCase(),
        match.outcome === 'win'
          ? "bg-[#00C8FF]/20 text-[#00C8FF] border-[#00C8FF]"
          : "bg-[#FF008C]/20 text-[#FF008C] border-[#FF008C]"
      );

      appendChildren(rightSide, [scoreDiv, badge]);
      appendChildren(gameItem, [leftSide, rightSide]);
      historyList.appendChild(gameItem);
    });
  } catch (error) {
    console.error('Failed to render recent matches:', error);
    if (token !== matchesRenderToken) {
      return;
    }

    historyList.innerHTML = '';
    const errorState = createDiv('text-center py-8 text-[#FF008C]');
    errorState.textContent = 'Unable to load match history';
    historyList.appendChild(errorState);
  }
}

async function resolveOpponentInfo(opponentId: string | null): Promise<{ name: string; avatarUrl: string | null }> {
  if (!opponentId) {
    return { name: 'Unknown Player', avatarUrl: null };
  }

  const cached = opponentNameCache.get(opponentId);
  if (cached) {
    return cached;
  }

  try {
  const profile = await getUserProfile(opponentId);
    const result = { name: profile.displayName, avatarUrl: profile.avatarUrl ?? null };
    opponentNameCache.set(opponentId, result);
    return result;
  } catch (error) {
    console.warn('Unable to load opponent profile:', error);
    const fallback = { name: 'Unknown Player', avatarUrl: null };
    opponentNameCache.set(opponentId, fallback);
    return fallback;
  }
}

function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  }
}

function createAvatar(
  initials: string,
  size: string = "h-10 w-10",
  avatarUrl: string | null = null
): HTMLElement {
  const avatar = createDiv(
    `${size} rounded-full border border-[#00C8FF]/50 bg-[#00C8FF]/10 flex items-center justify-center overflow-hidden`
  );
  
  if (avatarUrl) {
    // Display avatar image
    const img = document.createElement("img");
    img.src = avatarUrl;
    img.alt = initials;
    img.className = "w-full h-full object-cover";
    img.onerror = () => {
      // Fallback to initials if image fails to load
      img.remove();
      const text = createElement("span", "text-[#00C8FF]");
      text.textContent = initials;
      avatar.appendChild(text);
    };
    avatar.appendChild(img);
  } else {
    // Display initials
    const text = createElement("span", "text-[#00C8FF]");
    text.textContent = initials;
    avatar.appendChild(text);
  }
  
  return avatar;
}

function createBadge(text: string, className: string): HTMLElement {
  const badge = createElement(
    "span",
    `px-2 py-1 rounded text-sm border ${className}`
  );
  badge.textContent = text;
  return badge;
}

export function createProfilePage(): HTMLElement {
  const viewerId = getUserId();
  const storedTarget = sessionStorage.getItem('profile:viewUserId');
  if (storedTarget) {
    sessionStorage.removeItem('profile:viewUserId');
  }
  profileUserId = storedTarget ?? viewerId ?? null;
  viewingOwnProfile = !storedTarget || storedTarget === viewerId || !viewerId;

  const container = createDiv("min-h-screen w-full bg-[#121217] pt-24 pb-12");
  const innerContainer = createDiv("max-w-6xl mx-auto px-4");
  const grid = createDiv("grid gap-6 lg:grid-cols-12");

  const sidebar = createDiv("space-y-6 lg:col-span-4");
  const content = createDiv("space-y-6 lg:col-span-8");

  // Overview Card
  const overviewCard = createDiv("border border-[#00C8FF]/30 bg-[#1a1a24] rounded p-6 space-y-6");
  const overviewHeader = createDiv("flex flex-col items-center gap-3");

  const largeAvatar = createDiv(
    "h-28 w-28 rounded-full border-4 border-[#00C8FF] bg-[#00C8FF]/10 flex items-center justify-center overflow-hidden shadow-[0_0_18px_rgba(0,200,255,0.35)]"
  );
  largeAvatar.setAttribute('data-profile-avatar', 'true');
  const avatarPlaceholder = createElement("span", "text-[#00C8FF] text-3xl");
  avatarPlaceholder.textContent = "...";
  largeAvatar.appendChild(avatarPlaceholder);

  const name = createElement("h2", "text-xl font-semibold text-[#E0E0E0]");
  name.textContent = "Loading...";
  name.setAttribute('data-profile-name', 'true');

  const memberSince = createElement("p", "text-sm text-[#E0E0E0]/60");
  memberSince.textContent = "Member since —";
  memberSince.setAttribute('data-profile-joined', 'true');

  appendChildren(overviewHeader, [largeAvatar, name, memberSince]);

  const overviewMetrics = createDiv("grid gap-3 w-full");
  const metricConfig = [
    { label: "Current ELO", attr: "data-stat-elo" },
    { label: "Global Rank", attr: "data-stat-rank" },
    { label: "Level", attr: "data-stat-level" },
  ];

  metricConfig.forEach((metric) => {
    const row = createDiv("flex items-center justify-between rounded border border-[#00C8FF]/20 bg-[#121217] px-3 py-2");
    const label = createElement("span", "text-xs uppercase tracking-wide text-[#E0E0E0]/50");
    label.textContent = metric.label;
    const value = createElement("span", "text-base font-medium text-[#E0E0E0]");
    value.textContent = "—";
    value.setAttribute(metric.attr, 'true');
    appendChildren(row, [label, value]);
    overviewMetrics.appendChild(row);
  });

  const actionStack = createDiv("flex flex-col gap-2");
  const editBtn = createButton(
    "Edit Profile",
    "w-full bg-[#00C8FF] text-[#121217] hover:bg-[#00C8FF]/90 px-4 py-2 rounded transition-colors"
  );

  const manageSecurityBtn = createButton(
    "Manage Security",
    "w-full border border-[#00C8FF]/40 text-[#00C8FF] hover:border-[#00C8FF] px-4 py-2 rounded transition-colors",
    () => toggleModal(true, 'security')
  );
  if (viewingOwnProfile) {
    appendChildren(actionStack, [editBtn, manageSecurityBtn]);
  } else {
    const note = createElement(
      "p",
      "text-xs text-center text-[#E0E0E0]/60 border border-[#00C8FF]/15 bg-[#121217] rounded px-3 py-2"
    );
    note.textContent = "Profile actions are available only on your own account.";
    actionStack.appendChild(note);
  }

  appendChildren(overviewCard, [overviewHeader, overviewMetrics, actionStack]);

  // Security Summary Card
  const securitySummary = createDiv("border border-[#00C8FF]/30 bg-[#1a1a24] rounded p-6 space-y-4");
  const securityTitle = createElement("h3", "text-lg font-semibold text-[#E0E0E0]");
  securityTitle.textContent = "Account Security";
  const securityBadge = createDiv(
    "inline-flex items-center rounded px-3 py-1 text-sm border border-[#E0E0E0]/30 text-[#E0E0E0]/70 bg-[#121217]"
  );
  securityBadge.setAttribute('data-security-badge', 'true');
  securityBadge.textContent = "Checking status...";
  const securityDetail = createElement("p", "text-sm text-[#E0E0E0]/60");
  securityDetail.setAttribute('data-security-detail', 'true');
  securityDetail.textContent = "We'll show your two-factor status once it loads.";

  const securityManageBtn = createButton(
    "Manage Two-Factor",
    "w-full bg-[#00C8FF]/10 border border-[#00C8FF]/40 text-[#00C8FF] hover:border-[#00C8FF] px-4 py-2 rounded transition-colors",
    () => toggleModal(true, 'security')
  );

  if (viewingOwnProfile) {
    appendChildren(securitySummary, [securityTitle, securityBadge, securityDetail, securityManageBtn]);
  } else {
    securityBadge.textContent = 'Private';
    securityBadge.className = 'inline-flex items-center rounded px-3 py-1 text-sm border border-[#2A2E4A]/60 text-[#8D93B5] bg-[#1a1d2d]';
    securityDetail.textContent = 'Only account owners can view security information.';
    appendChildren(securitySummary, [securityTitle, securityBadge, securityDetail]);
  }

  appendChildren(sidebar, [overviewCard, securitySummary]);

  // Stats Card
  const statsCard = createDiv("border border-[#00C8FF]/30 bg-[#1a1a24] rounded p-6 space-y-4");
  const statsTitle = createElement("h3", "text-lg font-semibold text-[#E0E0E0]");
  statsTitle.textContent = "Match Performance";
  const statsGrid = createDiv("grid gap-4 sm:grid-cols-2");

  const statItems = [
    { label: "Wins", attr: "data-stat-wins", color: "#00C8FF" },
    { label: "Losses", attr: "data-stat-losses", color: "#FF008C" },
    { label: "Win Rate", attr: "data-stat-winrate", color: "#00C8FF" },
    { label: "Win Streak", attr: "data-stat-streak", color: "#00C8FF" },
    { label: "Total Games", attr: "data-stat-games", color: "#7B2BFF" },
  ];

  statItems.forEach((item) => {
    const statCardItem = createDiv("rounded border border-[#00C8FF]/20 bg-[#121217] p-4 space-y-2");
    const label = createElement("p", "text-xs uppercase tracking-wide text-[#E0E0E0]/50");
    label.textContent = item.label;
    const value = createElement("p", "text-2xl font-semibold");
    value.style.color = item.color;
    value.textContent = "—";
    value.setAttribute(item.attr, 'true');
    statCardItem.appendChild(label);
    statCardItem.appendChild(value);
    statsGrid.appendChild(statCardItem);
  });

  appendChildren(statsCard, [statsTitle, statsGrid]);

  const insightsCard = createDiv("border border-[#00C8FF]/30 bg-[#1a1a24] rounded p-6 space-y-5");
  const insightsHeader = createDiv("flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between");
  const insightsTitle = createElement("h3", "text-lg font-semibold text-[#E0E0E0]");
  insightsTitle.textContent = "Performance Insights";
  const trendWrapper = createDiv("w-full sm:w-48");
  const trendLabel = createElement("p", "text-xs uppercase tracking-wide text-[#E0E0E0]/50");
  trendLabel.textContent = "Recent Win Rate";
  const trendBarShell = createDiv("mt-2 h-2 rounded-full bg-[#23263a] overflow-hidden");
  const trendBarFill = createDiv("h-full bg-gradient-to-r from-[#00C8FF] to-[#7B2BFF] transition-all duration-500 ease-out");
  trendBarFill.style.width = "0%";
  trendBarFill.setAttribute("data-insight-recent-bar", "true");
  trendBarShell.appendChild(trendBarFill);
  appendChildren(trendWrapper, [trendLabel, trendBarShell]);
  appendChildren(insightsHeader, [insightsTitle, trendWrapper]);

  const insightsGrid = createDiv("grid gap-4 sm:grid-cols-2");
  const insightsConfig = [
    {
      label: "Last 10 Games",
      valueAttr: "data-insight-recent-record",
      helperAttr: "data-insight-recent-summary",
      helperDefault: "Track your momentum over the last matches.",
    },
    {
      label: "Avg Points Scored",
      valueAttr: "data-insight-points-for",
      helperAttr: "data-insight-points-for-helper",
      helperDefault: "Average goals you put up per match.",
    },
    {
      label: "Avg Points Conceded",
      valueAttr: "data-insight-points-against",
      helperAttr: "data-insight-points-against-helper",
      helperDefault: "Average goals allowed per match.",
    },
    {
      label: "Score Differential",
      valueAttr: "data-insight-differential",
      helperAttr: "data-insight-differential-helper",
      helperDefault: "Positive numbers mean you're outscoring opponents.",
    },
    {
      label: "Best Win Margin",
      valueAttr: "data-insight-best-margin",
      helperAttr: "data-insight-best-margin-helper",
      helperDefault: "Largest recent victory margin.",
    },
    {
      label: "Closest Loss",
      valueAttr: "data-insight-closest-loss",
      helperAttr: "data-insight-closest-loss-helper",
      helperDefault: "Smallest margin in a recent defeat.",
    },
  ];

  insightsConfig.forEach((item) => {
    const card = createDiv("rounded border border-[#00C8FF]/20 bg-[#121217] p-4 space-y-2");
    const label = createElement("p", "text-xs uppercase tracking-wide text-[#E0E0E0]/50");
    label.textContent = item.label;
    const value = createElement("p", "text-2xl font-semibold text-[#E0E0E0]");
    value.textContent = "—";
    value.setAttribute(item.valueAttr, "true");
    const helper = createElement("p", "text-xs text-[#E0E0E0]/50");
    helper.textContent = item.helperDefault;
    if (item.helperAttr) {
      helper.setAttribute(item.helperAttr, "true");
    }
    appendChildren(card, [label, value, helper]);
    insightsGrid.appendChild(card);
  });

  appendChildren(insightsCard, [insightsHeader, insightsGrid]);

  // Recent Matches Card
  const historyCard = createDiv("border border-[#00C8FF]/30 bg-[#1a1a24] rounded p-6 space-y-4");
  const historyTitle = createElement("h3", "text-lg font-semibold text-[#E0E0E0]");
  historyTitle.textContent = "Recent Matches";
  const historyList = createDiv("space-y-3");
  historyList.setAttribute('data-match-history', 'true');
  const historyPlaceholder = createDiv('text-center py-8 text-[#E0E0E0]/60');
  historyPlaceholder.textContent = 'Loading match history...';
  historyList.appendChild(historyPlaceholder);
  appendChildren(historyCard, [historyTitle, historyList]);

  appendChildren(content, [statsCard, insightsCard, historyCard]);
  appendChildren(grid, [sidebar, content]);
  innerContainer.appendChild(grid);
  container.appendChild(innerContainer);

  // Modal state
  let modalOpen = false;
  let isSaving = false;

  const modalOverlay = createDiv(
    "fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 hidden"
  );
  const modalBox = createDiv(
    "w-full max-w-5xl bg-[#1a1a24] border border-[#00C8FF] rounded p-6 relative"
  );
  const closeBtn = createButton(
    "✕",
    "absolute top-3 right-3 text-[#E0E0E0]/60 px-2 py-1 rounded hover:bg-[#00C8FF]/10",
    () => toggleModal(false)
  );
  closeBtn.setAttribute("aria-label", "Close edit profile");
  modalBox.appendChild(closeBtn);

  const modalTitle = createElement("h2", "text-[#00C8FF] text-xl mb-4");
  modalTitle.textContent = "Manage Profile";
  const modalBody = createDiv("grid grid-cols-1 lg:grid-cols-2 gap-6");

  const generalContainer = createDiv("space-y-4");
  const securityContainer = createDiv("space-y-4");

  function renderGeneral() {
    generalContainer.innerHTML = "";

    const profile = currentProfile;
    const userInfo = getUser();
    const avatarRow = createDiv("flex items-center gap-4");
    const avatarPreview = createDiv(
      "h-20 w-20 rounded-full border-2 border-[#00C8FF] bg-[#00C8FF]/10 flex items-center justify-center overflow-hidden"
    );

    if (profile?.avatarUrl) {
      const img = document.createElement('img');
      img.src = profile.avatarUrl;
      img.alt = profile.displayName;
      img.className = 'w-full h-full object-cover';
      img.onerror = () => {
        img.remove();
        const fallback = createElement('span', 'text-[#00C8FF] text-2xl');
        fallback.textContent = profile ? getInitials(profile.displayName) : '--';
        avatarPreview.appendChild(fallback);
      };
      avatarPreview.appendChild(img);
    } else {
      const initials = createElement('span', 'text-[#00C8FF] text-2xl');
      initials.textContent = profile ? getInitials(profile.displayName) : '--';
      avatarPreview.appendChild(initials);
    }

    const avatarMeta = createDiv("space-y-1");
    const avatarStatus = createElement("p", "text-sm text-[#E0E0E0]");
    avatarStatus.textContent = profile ? profile.displayName : 'Loading profile...';
    const avatarHint = createElement("p", "text-xs text-[#E0E0E0]/50");
    avatarHint.textContent = "Custom avatars are coming soon.";
    appendChildren(avatarMeta, [avatarStatus, avatarHint]);

    appendChildren(avatarRow, [avatarPreview, avatarMeta]);

    const usernameLabel = createLabel(
      "Display Name",
      "edit-username",
      "text-[#E0E0E0]/80"
    );
    const usernameInput = createInput(
      "text",
      "w-full px-3 py-2 rounded border border-[#00C8FF]/30 bg-[#121217] text-[#E0E0E0]"
    );
    usernameInput.id = "edit-username";
    usernameInput.value = profile?.displayName ?? '';
    usernameInput.placeholder = profile ? '' : 'Loading profile...';
    usernameInput.disabled = !profile;

    const emailLabel = createLabel("Email", "edit-email", "text-[#E0E0E0]/80");
    const emailInput = createInput(
      "email",
      "w-full px-3 py-2 rounded border border-[#00C8FF]/30 bg-[#121217] text-[#E0E0E0]"
    );
    emailInput.id = "edit-email";
    emailInput.value = profile?.email ?? userInfo?.email ?? "";
    emailInput.placeholder = profile?.email ?? userInfo?.email ?? "Enter new email";
    emailInput.required = true;
    emailInput.autocomplete = "email";

    const saveBtn = createButton(
      "Save Changes",
      "w-full bg-[#00C8FF] text-[#121217] hover:bg-[#00C8FF]/90 px-4 py-2 rounded transition-colors",
      async () => {
        if (isSaving || !usernameInput.value.trim()) return;
        if (!profile) {
          showErrorMessage('Profile data is still loading.');
          return;
        }

        isSaving = true;
        saveBtn.setAttribute("disabled", "true");
        saveBtn.textContent = "Saving...";

        try {
          const userId = getUserId();
          if (!userId) {
            throw new Error('User session expired. Please log in again.');
          }

          const displayName = usernameInput.value.trim();
          const email = emailInput.value.trim();

          if (displayName.length < 3) {
            throw new Error('Display name must be at least 3 characters');
          }

          if (displayName.length > 32) {
            throw new Error('Display name must be at most 32 characters');
          }

          if (email.length === 0) {
            throw new Error('Email is required');
          }

          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error('Enter a valid email address');
          }

          await updateUserProfile(userId, { displayName, email });
          await profileState.loadProfile(userId);
          setUser({ id: userId, email, displayName });

          showSuccessMessage('Profile updated successfully!');
          toggleModal(false);
        } catch (error) {
          console.error('Failed to update profile:', error);
          showErrorMessage(error instanceof Error ? error.message : 'Failed to update profile');
        } finally {
          isSaving = false;
          saveBtn.removeAttribute("disabled");
          saveBtn.textContent = "Save Changes";
        }
      }
    );
    saveBtn.disabled = !profile;

    appendChildren(generalContainer, [
      avatarRow,
      usernameLabel,
      usernameInput,
      emailLabel,
      emailInput,
      saveBtn,
    ]);
  }

  function renderSecurity(): void {
    securityContainer.innerHTML = "";

    const stateSnapshot = profileState.getState();
    updateSecuritySummary(stateSnapshot);

    const {
      twoFactor,
      twoFactorEnrollment,
      twoFactorLoading,
      twoFactorError,
    } = stateSnapshot;

    const status = twoFactor?.status ?? 'disabled';
    const enrollment = twoFactorEnrollment;
    const busy = twoFactorLoading === 'loading';

    if (twoFactorLoading === 'loading' && !twoFactor && !enrollment) {
      const loading = createDiv("text-sm text-[#E0E0E0]/60");
      loading.textContent = "Loading two-factor status...";
      securityContainer.appendChild(loading);
      return;
    }

    if (twoFactorError) {
      const errorBanner = createDiv(
        "mb-4 rounded border border-[#FF008C]/40 bg-[#FF008C]/10 px-3 py-2 text-sm text-[#FF008C]"
      );
      errorBanner.textContent = twoFactorError;
      securityContainer.appendChild(errorBanner);
    }

    const appendProcessingNotice = () => {
      const processing = createDiv("mt-3 text-xs text-[#E0E0E0]/60 text-center sm:text-left");
      processing.textContent = "Processing two-factor request...";
      securityContainer.appendChild(processing);
    };

    const renderDisabled = () => {
      const statusRow = createDiv("flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between");
      const statusLabel = createElement("p", "text-[#E0E0E0] text-center sm:text-left");
      statusLabel.textContent = "Two-Factor Authentication";
      const statusBadge = createDiv("px-3 py-1 rounded text-sm bg-red-600 text-white");
      statusBadge.textContent = "Disabled";
      statusRow.appendChild(statusLabel);
      statusRow.appendChild(statusBadge);

      const description = createElement("p", "mt-2 text-sm text-[#E0E0E0]/70 text-center sm:text-left");
      description.textContent = "Secure your account by enabling app-based two-factor authentication.";

      const enableBtn = createButton(
        busy ? "Starting..." : "Enable Two-Factor Authentication",
        "w-full mt-3 px-4 py-2 rounded bg-[#00C8FF] text-[#121217] hover:bg-[#00C8FF]/90 transition-colors sm:w-auto sm:self-start"
      );
      enableBtn.disabled = busy;
      enableBtn.addEventListener('click', async () => {
        enableBtn.disabled = true;
        enableBtn.textContent = 'Starting...';
        try {
          await profileState.startTwoFactorEnrollment();
          showSuccessMessage('Two-factor enrollment started. Scan the QR code to continue.');
        } catch (error) {
          console.error('Failed to start two-factor enrollment:', error);
          const message = error instanceof Error ? error.message : 'Failed to start two-factor enrollment';
          showErrorMessage(message);
        } finally {
          enableBtn.disabled = false;
          enableBtn.textContent = 'Enable Two-Factor Authentication';
          renderSecurity();
        }
      });

      appendChildren(securityContainer, [statusRow, description, enableBtn]);
    };

    const renderPending = () => {
      const currentEnrollment = enrollment;

      if (!currentEnrollment) {
        const info = createDiv("space-y-3 text-center sm:text-left");
        const header = createElement("h3", "text-[#E0E0E0] text-center sm:text-left");
        header.textContent = "Two-Factor Enrollment Pending";
        const textMessage = createElement("p", "text-sm text-[#E0E0E0]/70");
        textMessage.textContent = "Your enrollment is pending. Restart the setup to generate a new QR code.";
        const restartBtn = createButton(
          busy ? "Refreshing..." : "Restart Enrollment",
          "w-full px-4 py-2 rounded bg-[#00C8FF] text-[#121217] hover:bg-[#00C8FF]/90 sm:w-auto sm:self-start"
        );
        restartBtn.disabled = busy;
        restartBtn.addEventListener('click', async () => {
          restartBtn.disabled = true;
          restartBtn.textContent = 'Refreshing...';
          try {
            await profileState.startTwoFactorEnrollment();
            showSuccessMessage('Generated a new enrollment QR code.');
          } catch (error) {
            console.error('Failed to restart two-factor enrollment:', error);
            const message = error instanceof Error ? error.message : 'Failed to restart enrollment';
            showErrorMessage(message);
          } finally {
            restartBtn.disabled = false;
            restartBtn.textContent = 'Restart Enrollment';
            renderSecurity();
          }
        });
        appendChildren(info, [header, textMessage, restartBtn]);
        securityContainer.appendChild(info);
        if (busy) appendProcessingNotice();
        return;
      }

      const header = createElement("h3", "text-[#E0E0E0]");
      header.textContent = "Scan the QR Code";

      const layout = createDiv("mt-4 grid w-full gap-6 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)] items-start");

      const qrColumn = createDiv("flex flex-col items-center gap-3");
      if (currentEnrollment.qrCodeDataUrl) {
        const qrImg = document.createElement('img');
        qrImg.src = currentEnrollment.qrCodeDataUrl;
        qrImg.alt = 'Two-factor QR code';
        qrImg.className = 'h-40 w-40 rounded border border-[#00C8FF]/30 bg-[#121217] object-contain p-3';
        qrColumn.appendChild(qrImg);
      }
      const secretBox = createDiv("w-full break-all rounded border border-[#00C8FF]/30 bg-[#121217] px-3 py-2 text-sm text-[#E0E0E0]");
      secretBox.textContent = `Secret: ${currentEnrollment.secret}`;
      const expiresInfo = createElement("p", "text-xs text-[#E0E0E0]/60 text-center");
      expiresInfo.textContent = `Enrollment expires at ${new Date(currentEnrollment.expiresAt).toLocaleTimeString()}`;
      qrColumn.appendChild(secretBox);
      qrColumn.appendChild(expiresInfo);

      const formColumn = createDiv("flex w-full flex-col gap-4");
      const instructions = createElement("p", "text-sm text-[#E0E0E0]/70");
      instructions.textContent = "Scan this code with Google Authenticator, Authy, or any compatible app, then enter the 6-digit code to activate two-factor authentication.";

      const codeField = createDiv("flex w-full flex-col gap-2");
      const codeLabel = createElement("p", "text-sm text-[#E0E0E0]/80");
      codeLabel.textContent = "Enter the current 6-digit code from your authenticator:";
      const codeInput = createInput("text", "w-full px-4 py-2 text-center text-lg tracking-[0.6em] rounded border border-[#00C8FF]/30 bg-[#121217] text-[#E0E0E0] sm:text-left sm:tracking-normal", "");
      codeInput.maxLength = 6;
      codeField.appendChild(codeLabel);
      codeField.appendChild(codeInput);

      const actions = createDiv("flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3");
      const confirmBtn = createButton(busy ? "Verifying..." : "Verify & Activate", "w-full px-4 py-2 rounded bg-[#00C8FF] text-[#121217] hover:bg-[#00C8FF]/90 text-center sm:flex-1 sm:min-w-[160px]");
      confirmBtn.disabled = busy;
      confirmBtn.addEventListener('click', async () => {
        const code = codeInput.value.trim();
        if (!/^[0-9]{6}$/.test(code)) {
          showErrorMessage('Enter a valid 6-digit code generated by your authenticator app.');
          return;
        }

        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Verifying...';
        try {
          await profileState.confirmTwoFactorEnrollment(code);
          showSuccessMessage('Two-factor authentication enabled successfully.');
          codeInput.value = '';
        } catch (error) {
          console.error('Failed to confirm two-factor enrollment:', error);
          const message = error instanceof Error ? error.message : 'Failed to confirm two-factor enrollment';
          showErrorMessage(message);
        } finally {
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Verify & Activate';
          renderSecurity();
        }
      });

      const cancelBtn = createButton(busy ? "Cancelling..." : "Cancel Enrollment", "w-full px-4 py-2 rounded border border-[#00C8FF]/40 text-[#E0E0E0] hover:border-[#00C8FF] text-center sm:flex-1 sm:min-w-[160px]");
      cancelBtn.disabled = busy;
      cancelBtn.addEventListener('click', async () => {
        cancelBtn.disabled = true;
        cancelBtn.textContent = 'Cancelling...';
        try {
          await profileState.cancelTwoFactorEnrollment();
          showSuccessMessage('Two-factor enrollment cancelled.');
        } catch (error) {
          console.error('Failed to cancel two-factor enrollment:', error);
          const message = error instanceof Error ? error.message : 'Failed to cancel enrollment';
          showErrorMessage(message);
        } finally {
          cancelBtn.disabled = false;
          cancelBtn.textContent = 'Cancel Enrollment';
          renderSecurity();
        }
      });

      actions.appendChild(confirmBtn);
      actions.appendChild(cancelBtn);

      formColumn.appendChild(instructions);
      formColumn.appendChild(codeField);
      formColumn.appendChild(actions);

      layout.appendChild(qrColumn);
      layout.appendChild(formColumn);

      const helpText = createElement("p", "text-xs text-[#E0E0E0]/60 mt-1");
      helpText.textContent = 'Keep your authenticator app accessible. If you lose access, contact an administrator to regain entry.';

      appendChildren(securityContainer, [
        header,
        layout,
        helpText,
      ]);

      if (busy) appendProcessingNotice();
    };
    const renderActive = () => {
      const statusRow = createDiv("flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between");
      const statusLabel = createElement("p", "text-[#E0E0E0] text-center sm:text-left");
      statusLabel.textContent = "Two-Factor Authentication";
      const statusBadge = createDiv("px-3 py-1 rounded text-sm bg-green-600 text-white");
      statusBadge.textContent = "Enabled";
      statusRow.appendChild(statusLabel);
      statusRow.appendChild(statusBadge);

      const verifiedInfo = createElement("p", "mt-2 text-sm text-[#E0E0E0]/70 text-center sm:text-left");
      if (twoFactor?.lastVerifiedAt) {
        verifiedInfo.textContent = `Last verified on ${new Date(twoFactor.lastVerifiedAt).toLocaleString()}`;
      } else {
        verifiedInfo.textContent = 'Two-factor authentication is active.';
      }

      const disableBtn = createButton(
        busy ? "Disabling..." : "Disable Two-Factor Authentication",
        "w-full mt-4 px-4 py-2 rounded border border-[#FF008C]/50 text-[#FF008C] hover:border-[#FF008C] sm:w-auto sm:self-start"
      );
      disableBtn.disabled = busy;
      disableBtn.addEventListener('click', () => {
        if (busy) {
          return;
        }

        showPrompt(
          'Disable Two-Factor',
          'Enter a valid two-factor code to disable protection.',
          async (value: string) => {
            const code = value.trim();
            if (!code) {
              showErrorMessage('Two-factor code is required to disable protection.');
              return;
            }

            disableBtn.disabled = true;
            disableBtn.textContent = 'Disabling...';
            try {
              await profileState.disableTwoFactor(code);
              showSuccessMessage('Two-factor authentication disabled.');
            } catch (error) {
              console.error('Failed to disable two-factor authentication:', error);
              const message = error instanceof Error ? error.message : 'Failed to disable two-factor authentication';
              showErrorMessage(message);
            } finally {
              disableBtn.disabled = false;
              disableBtn.textContent = 'Disable Two-Factor Authentication';
              renderSecurity();
            }
          }
        );
      });

      const helpText = createElement("p", "text-xs text-[#E0E0E0]/60 mt-1 text-center sm:text-left");
      helpText.textContent = 'Keep your authenticator app accessible. If you lose access, contact an administrator to regain entry.';

      appendChildren(securityContainer, [statusRow, verifiedInfo, helpText, disableBtn]);
      if (busy) appendProcessingNotice();
    };

    if (status === 'pending' || enrollment) {
      renderPending();
      return;
    }

    if (status === 'active') {
      renderActive();
      return;
    }

    renderDisabled();
    if (busy) appendProcessingNotice();
  }

  profileState.subscribe((state) => {
    updateSecuritySummary(state);

    if (!modalOpen) {
      return;
    }

    if (state.profileLoading === 'success') {
      renderGeneral();
    }

    renderSecurity();
  });

  function toggleModal(open: boolean, focusSection: 'general' | 'security' = 'general') {
    if (!viewingOwnProfile) {
      return;
    }
    modalOpen = open;
    if (modalOpen) {
      modalOverlay.classList.remove("hidden");
      renderGeneral();
      renderSecurity();
      requestAnimationFrame(() => {
        const target = focusSection === 'security' ? securityContainer : generalContainer;
        target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    } else {
      modalOverlay.classList.add("hidden");
    }
  }

  modalBody.appendChild(generalContainer);
  modalBody.appendChild(securityContainer);
  appendChildren(modalBox, [modalTitle, modalBody]);
  modalOverlay.appendChild(modalBox);
  container.appendChild(modalOverlay);

  if (viewingOwnProfile) {
    editBtn.addEventListener("click", () => toggleModal(true, 'general'));
  }

  // Load profile data on mount
  if (profileUserId) {
    loadProfileData(profileUserId).catch(err => {
      console.error('Failed to load profile:', err);
    });
  } else {
    showErrorMessage('Unable to load profile. Please try again.');
  }

  // Add loading spinner
  const spinner = createDiv('fixed inset-0 bg-black/60 flex items-center justify-center z-50 hidden');
  spinner.setAttribute('data-loading-spinner', 'true');
  const spinnerContent = createDiv('text-[#00C8FF] text-xl');
  spinnerContent.textContent = 'Loading profile...';
  spinner.appendChild(spinnerContent);
  container.appendChild(spinner);

  updateSecuritySummary();

  return container;
}

// Exported 2FA verification component (UI only) — can be shown after login to prompt for 6-digit code
export function create2FAVerifyComponent(onVerified?: () => void): HTMLElement {
  const box = createDiv(
    "w-full max-w-sm bg-[#1a1a24] border border-[#00C8FF] p-6 rounded space-y-4"
  );
  const title = createElement("h3", "text-[#00C8FF]");
  title.textContent = "Two-Factor Authentication";
  const subtitle = createElement("p", "text-[#E0E0E0]/60");
  subtitle.textContent = "Enter your 6-digit code to continue";

  const codeInput = createInput(
    "text",
    "w-full px-3 py-2 rounded border border-[#00C8FF]/30 bg-[#121217] text-[#E0E0E0]"
  );
  codeInput.maxLength = 6;

  const verifyBtn = createButton(
    "Verify & Continue",
    "w-full bg-[#00C8FF] text-[#121217] px-4 py-2 rounded",
    () => {
      if (codeInput.value.trim().length === 6) {
        if (onVerified) onVerified();
      }
    }
  );

  appendChildren(box, [title, subtitle, codeInput, verifyBtn]);
  return box;
}
