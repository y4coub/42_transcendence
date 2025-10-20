import { createDiv, createElement, createButton, createInput, appendChildren } from "../utils/dom";
import { createIcon } from "../utils/icons";
import { getUserId } from "../lib/auth";
import { dashboardState } from "../features/home/state";
import type { DashboardState } from "../features/home/state";
import {
  getUserProfile,
  getFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  sendFriendRequest,
  searchUsers,
} from "../lib/api-client";
import type {
  UserStats,
  LeaderboardEntry,
  UserProfile,
  RecentMatchFeedItem,
  FriendRequestsResponse,
  FriendRequestSummary,
  FriendRelationshipStatus,
  UserSearchResult,
} from "../lib/api-client";
import { navigate } from "../lib/router-instance";
import { showError } from "../components/Modal";

// Current dashboard data
let currentUserStats: UserStats | null = null;
let currentLeaderboard: LeaderboardEntry[] = [];
let currentUserProfile: UserProfile | null = null;
let currentRecentMatches: RecentMatchFeedItem[] = [];
let currentFriendRequests: FriendRequestsResponse | null = null;
let dashboardUnsubscribe: (() => void) | null = null;
let friendRequestsLoaded = false;
let friendSearchResults: UserSearchResult[] = [];
let friendSearchLoading = false;
let friendSearchError: string | null = null;
let friendSearchQuery = '';
let friendSearchRequestToken = 0;

function handleDashboardState(state: DashboardState): void {
  currentUserStats = state.userStats;
  currentLeaderboard = state.leaderboard;
  currentRecentMatches = state.recentMatches;
  updateDashboardDisplay();
  updateLeaderboardDisplay();
  updateRecentMatchesDisplay();
}

function createAvatar(
  initials: string,
  size: string = "h-10 w-10",
  avatarUrl: string | null = null,
  borderClass: string = "border-[#00C8FF]/50"
): HTMLElement {
  const avatar = createDiv(
    `${size} rounded-full border ${borderClass} bg-[#00C8FF]/10 flex items-center justify-center overflow-hidden`
  );
  
  if (avatarUrl) {
    const img = document.createElement("img");
    img.src = avatarUrl;
    img.alt = initials;
    img.className = "w-full h-full object-cover";
    img.onerror = () => {
      img.remove();
      const text = createElement("span", "text-[#00C8FF]");
      text.textContent = initials;
      avatar.appendChild(text);
    };
    avatar.appendChild(img);
  } else {
    const text = createElement("span", "text-[#00C8FF]");
    text.textContent = initials;
    avatar.appendChild(text);
  }
  
  return avatar;
}


function createMetricsBadge(text: string, className: string): HTMLElement {
  const badge = createElement("span", `px-2 py-0.5 rounded-full border ${className}`);
  badge.textContent = text;
  return badge;
}

function createBadge(text: string, className: string): HTMLElement {
  const badge = createElement("span", `px-2 py-1 rounded text-sm ${className}`);
  badge.textContent = text;
  return badge;
}

function createStatusPill(text: string, className: string): HTMLElement {
  const pill = createElement(
    "span",
    `text-[10px] uppercase tracking-[0.35em] px-3 py-1 rounded border ${className}`
  );
  pill.textContent = text;
  return pill;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && typeof error.message === 'string' && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  return fallback;
}

function formatRequestTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Recently';
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderFriendRequests(): void {
  const incomingContainer = document.querySelector<HTMLElement>('[data-friend-requests-incoming]');
  const outgoingContainer = document.querySelector<HTMLElement>('[data-friend-requests-outgoing]');

  if (!incomingContainer || !outgoingContainer) {
    return;
  }

  incomingContainer.innerHTML = '';
  outgoingContainer.innerHTML = '';

  if (!friendRequestsLoaded) {
    const loading = createElement("p", "text-xs text-[#E0E0E0]/60");
    loading.textContent = "Loading friend requests...";
    incomingContainer.appendChild(loading);
    outgoingContainer.appendChild(loading.cloneNode(true));
    return;
  }

  const incoming = currentFriendRequests?.incoming ?? [];
  const outgoing = currentFriendRequests?.outgoing ?? [];

  if (!incoming.length) {
    const empty = createElement("p", "text-xs text-[#E0E0E0]/40");
    empty.textContent = "No pending requests.";
    incomingContainer.appendChild(empty);
  } else {
    incoming.forEach((request) => {
      const row = createDiv("flex items-center justify-between rounded border border-[#00C8FF]/20 bg-[#161822] px-3 py-3 gap-3");

      const info = createDiv("flex min-w-0 flex-1 items-center gap-3");
      const initials = request.displayName.substring(0, 2).toUpperCase();
      const avatar = createAvatar(initials, "h-10 w-10", request.avatarUrl, "border-[#00C8FF]/30");
      const meta = createDiv("flex min-w-0 flex-col");
      const name = createElement("span", "truncate text-sm font-semibold text-[#E0E0E0]");
      name.textContent = request.displayName;
      const time = createElement("span", "text-[10px] uppercase tracking-[0.3em] text-[#7A7F9A]");
      time.textContent = formatRequestTimestamp(request.createdAt);
      appendChildren(meta, [name, time]);
      appendChildren(info, [avatar, meta]);

      const actions = createDiv("flex shrink-0 items-center gap-2");

      const acceptBtn = createButton(
        "Accept",
        "rounded border border-[#00C8FF]/50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-[#00C8FF] transition-colors hover:bg-[#00C8FF]/10",
        () => {
          void handleFriendRequestAction('accept', request, acceptBtn);
        }
      );

      const declineBtn = createButton(
        "Decline",
        "rounded border border-[#FF008C]/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-[#FF4FA0] transition-colors hover:bg-[#FF008C]/10",
        () => {
          void handleFriendRequestAction('decline', request, declineBtn);
        }
      );

      appendChildren(actions, [acceptBtn, declineBtn]);
      appendChildren(row, [info, actions]);
      incomingContainer.appendChild(row);
    });
  }

  if (!outgoing.length) {
    const empty = createElement("p", "text-xs text-[#E0E0E0]/40");
    empty.textContent = "No outgoing requests.";
    outgoingContainer.appendChild(empty);
  } else {
    outgoing.forEach((request) => {
      const row = createDiv("flex items-center justify-between rounded border border-[#00C8FF]/10 bg-[#141621] px-3 py-3 gap-3");

      const info = createDiv("flex min-w-0 flex-1 items-center gap-3");
      const initials = request.displayName.substring(0, 2).toUpperCase();
      const avatar = createAvatar(initials, "h-10 w-10", request.avatarUrl, "border-[#00C8FF]/20");
      const meta = createDiv("flex min-w-0 flex-col");
      const name = createElement("span", "truncate text-sm font-semibold text-[#E0E0E0]");
      name.textContent = request.displayName;
      const time = createElement("span", "text-[10px] uppercase tracking-[0.3em] text-[#7A7F9A]");
      time.textContent = `Sent ${formatRequestTimestamp(request.createdAt)}`;
      appendChildren(meta, [name, time]);
      appendChildren(info, [avatar, meta]);

      const actions = createDiv("flex shrink-0 items-center gap-2");

      const cancelBtn = createButton(
        "Cancel",
        "rounded border border-[#FF008C]/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-[#FF4FA0] transition-colors hover:bg-[#FF008C]/10",
        () => {
          void handleFriendRequestAction('cancel', request, cancelBtn);
        }
      );

      actions.appendChild(cancelBtn);
      appendChildren(row, [info, actions]);
      outgoingContainer.appendChild(row);
    });
  }
}

function renderFriendSearch(): void {
  const statusEl = document.querySelector<HTMLElement>('[data-friend-search-status]');
  const resultsContainer = document.querySelector<HTMLElement>('[data-friend-search-results]');

  if (!statusEl || !resultsContainer) {
    return;
  }

  resultsContainer.innerHTML = '';

  if (friendSearchLoading) {
    statusEl.textContent = 'Searching...';
    return;
  }

  if (friendSearchError) {
    statusEl.textContent = friendSearchError;
    return;
  }

  if (friendSearchQuery.trim().length < 2) {
    statusEl.textContent = 'Enter at least 2 characters to search.';
    return;
  }

  if (!friendSearchResults.length) {
    statusEl.textContent = 'No players found.';
    return;
  }

  statusEl.textContent = friendSearchResults.length === 1 ? '1 player found.' : `${friendSearchResults.length} players found.`;

  friendSearchResults.forEach((result) => {
    const row = createDiv('flex items-center justify-between rounded border border-[#00C8FF]/15 bg-[#151822] px-3 py-3 gap-3');

    const info = createDiv('flex min-w-0 flex-1 items-center gap-3');
    const initials = result.displayName.substring(0, 2).toUpperCase();
    const avatar = createAvatar(initials, 'h-10 w-10', result.avatarUrl, 'border-[#00C8FF]/25');
    const meta = createDiv('flex min-w-0 flex-col');
    const name = createElement('span', 'truncate text-sm font-semibold text-[#E0E0E0]');
    name.textContent = result.displayName;
    appendChildren(meta, [name]);
    appendChildren(info, [avatar, meta]);

    const actions = createDiv('flex shrink-0 items-center gap-2');

    if (result.relationship === 'none') {
      const addBtn = createButton(
        'Add Friend',
        'rounded border border-[#00C8FF]/50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-[#00C8FF] transition-colors hover:bg-[#00C8FF]/10',
        () => {
          void handleSendFriendRequest(result, addBtn);
        }
      );
      actions.appendChild(addBtn);
    } else {
      let pillText = '';
      let pillClass = '';

      switch (result.relationship) {
        case 'self':
          pillText = 'You';
          pillClass = 'border-[#2A2E4A]/60 bg-[#1c1f2e] text-[#8D93B5]';
          break;
        case 'friend':
          pillText = 'Already Friends';
          pillClass = 'border-[#00C8FF]/40 bg-[#00C8FF]/10 text-[#00C8FF]';
          break;
        case 'incoming-request':
          pillText = 'Respond Pending';
          pillClass = 'border-[#FF008C]/40 bg-[#FF008C]/15 text-[#FF7AC3]';
          break;
        case 'outgoing-request':
          pillText = 'Request Sent';
          pillClass = 'border-[#F9A825]/40 bg-[#F9A825]/15 text-[#F9D27A]';
          break;
        default:
          pillText = 'Unavailable';
          pillClass = 'border-[#2A2E4A]/60 bg-[#1c1f2e] text-[#8D93B5]';
          break;
      }

      actions.appendChild(createStatusPill(pillText, pillClass));
    }

    appendChildren(row, [info, actions]);
    resultsContainer.appendChild(row);
  });
}

function updateSearchResultRelationship(userId: string, relationship: FriendRelationshipStatus): void {
  let updated = false;
  friendSearchResults = friendSearchResults.map((entry) => {
    if (entry.userId === userId) {
      updated = true;
      return { ...entry, relationship };
    }
    return entry;
  });

  if (updated) {
    renderFriendSearch();
  }
}

async function performFriendSearch(term: string): Promise<void> {
  const normalized = term.trim();
  friendSearchQuery = normalized;
  friendSearchError = null;

  if (normalized.length < 2) {
    friendSearchResults = [];
    friendSearchLoading = false;
    renderFriendSearch();
    return;
  }

  const token = ++friendSearchRequestToken;
  friendSearchLoading = true;
  renderFriendSearch();

  try {
    const response = await searchUsers(normalized);
    if (token !== friendSearchRequestToken) {
      return;
    }

    friendSearchResults = Array.isArray(response.results) ? response.results : [];
    friendSearchLoading = false;
    friendSearchError = null;
    renderFriendSearch();
  } catch (error) {
    if (token !== friendSearchRequestToken) {
      return;
    }

    console.error('Failed to search users:', error);
    friendSearchLoading = false;
    friendSearchError = error instanceof Error ? error.message : 'Failed to search players.';
    renderFriendSearch();
  }
}

async function handleSendFriendRequest(result: UserSearchResult, button: HTMLButtonElement): Promise<void> {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Sending...';

  let success = false;

  try {
    const response = await sendFriendRequest(result.userId);
    currentFriendRequests = response;
    friendRequestsLoaded = true;
    renderFriendRequests();
    updateSearchResultRelationship(result.userId, 'outgoing-request');
    success = true;
  } catch (error) {
    console.error('Failed to send friend request:', error);
    const fallback = `Unable to send a friend request to ${result.displayName}. Please try again.`;
    showError('Friend Requests', getErrorMessage(error, fallback));
  } finally {
    if (!success) {
      button.disabled = false;
      button.textContent = originalText ?? 'Add Friend';
    }
  }
}

async function loadFriendRequests(): Promise<void> {
  friendRequestsLoaded = false;
  renderFriendRequests();

  try {
    const requests = await getFriendRequests();
    currentFriendRequests = requests;
  } catch (error) {
    console.error('Failed to load friend requests:', error);
    currentFriendRequests = { incoming: [], outgoing: [] };
    showError(
      'Friend Requests',
      getErrorMessage(error, 'Unable to load friend requests right now. Please try again shortly.'),
    );
  } finally {
    friendRequestsLoaded = true;
    renderFriendRequests();
  }
}

async function handleFriendRequestAction(
  action: 'accept' | 'decline' | 'cancel',
  request: FriendRequestSummary,
  button: HTMLButtonElement
): Promise<void> {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = action === 'accept' ? 'Accepting...' : action === 'decline' ? 'Declining...' : 'Cancelling...';

  try {
    let response: FriendRequestsResponse;
    if (action === 'accept') {
      response = await acceptFriendRequest(request.requestId);
    } else if (action === 'decline') {
      response = await declineFriendRequest(request.requestId);
    } else {
      response = await cancelFriendRequest(request.requestId);
    }

    currentFriendRequests = response;
    friendRequestsLoaded = true;
    renderFriendRequests();

    if (action === 'accept') {
      updateSearchResultRelationship(request.userId, 'friend');
    } else {
      updateSearchResultRelationship(request.userId, 'none');
    }
  } catch (error) {
    console.error(`Failed to ${action} friend request:`, error);
    const fallback = `Unable to ${
      action === 'accept' ? 'accept' : action === 'decline' ? 'decline' : 'cancel'
    } the request from ${request.displayName}. Please try again.`;
    showError('Friend Requests', getErrorMessage(error, fallback));
    button.disabled = false;
    button.textContent = originalText ?? '';
  }
}

// Load dashboard data from API
async function loadDashboardData(): Promise<void> {
  try {
    const userId = getUserId();
    if (!userId) {
      console.error('No user ID found');
      return;
    }

    // Load all dashboard data
    await dashboardState.loadAll(userId);
    
    // Load user profile for avatar and display name
    currentUserProfile = await getUserProfile(userId);
    await loadFriendRequests();
    
  handleDashboardState(dashboardState.getState());
  } catch (error) {
    console.error('Failed to load dashboard data:', error);
  }
}

// Update dashboard display with real data
function updateDashboardDisplay(): void {
  const winRateEl = document.querySelector('[data-stat-winrate]');
  const gamesEl = document.querySelector('[data-stat-games]');
  const streakEl = document.querySelector('[data-stat-streak]');
  const winsEl = document.querySelector('[data-stat-wins]');
  const lossesEl = document.querySelector('[data-stat-losses]');

  if (currentUserProfile) {
    const profileNameEl = document.querySelector('[data-profile-name]');
    if (profileNameEl) profileNameEl.textContent = currentUserProfile.displayName;
    
    const profileAvatarEl = document.querySelector('[data-profile-avatar]');
    if (profileAvatarEl) {
      profileAvatarEl.innerHTML = '';
      const initials = currentUserProfile.displayName.substring(0, 2).toUpperCase();
      const avatar = createAvatar(initials, "h-20 w-20 border-2 shadow-[0_0_15px_rgba(0,200,255,0.5)]", currentUserProfile.avatarUrl);
      profileAvatarEl.appendChild(avatar);
    }

    const welcomeNameEl = document.querySelector('[data-welcome-name]');
    if (welcomeNameEl) welcomeNameEl.textContent = currentUserProfile.displayName;
  }

  if (!currentUserStats) {
    if (winRateEl) winRateEl.textContent = '0%';
    if (gamesEl) gamesEl.textContent = '0';
    if (streakEl) streakEl.textContent = '0';
    if (winsEl) winsEl.textContent = '0';
    if (lossesEl) lossesEl.textContent = '0';
    return;
  }

  const totalGames = currentUserStats.wins + currentUserStats.losses;
  const winRate = totalGames > 0
    ? Math.round((currentUserStats.wins / totalGames) * 100)
    : 0;
  
  if (winRateEl) winRateEl.textContent = `${winRate}%`;
  if (gamesEl) gamesEl.textContent = totalGames.toString();
  if (streakEl) streakEl.textContent = currentUserStats.streak.toString();
  if (winsEl) winsEl.textContent = currentUserStats.wins.toString();
  if (lossesEl) lossesEl.textContent = currentUserStats.losses.toString();

  // Update Leaderboard
  updateLeaderboardDisplay();

  // Update Recent Matches
  updateRecentMatchesDisplay();
}

// Update leaderboard with real data
function updateLeaderboardDisplay(): void {
  const leaderboardList = document.querySelector('[data-leaderboard-list]');
  if (!leaderboardList) return;

  leaderboardList.innerHTML = '';

  if (!currentLeaderboard.length) {
    const emptyState = createElement("p", "text-center text-[#E0E0E0]/60 py-4");
    emptyState.textContent = "No players have recorded matches yet.";
    leaderboardList.appendChild(emptyState);
    return;
  }

  currentLeaderboard.forEach((entry, index) => {
    const item = createDiv("group relative flex flex-col gap-2 rounded border border-[#00C8FF]/15 bg-[#121216] px-3 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#00C8FF]/50 hover:shadow-[0_12px_32px_rgba(0,200,255,0.15)]");

    const topRow = createDiv("flex items-center gap-3");

    const rankPill = createDiv("flex h-8 w-8 items-center justify-center rounded-full border border-[#00C8FF]/50 bg-[#0c0f1c] text-sm font-semibold text-[#00C8FF]");
    rankPill.textContent = `#${index + 1}`;

    const initials = entry.displayName.substring(0, 2).toUpperCase();
    const avatar = createAvatar(initials, "h-10 w-10", entry.avatarUrl);

    const nameBlock = createDiv("flex min-w-0 flex-1 flex-col");
    const name = createElement("span", "truncate text-sm font-semibold text-[#E6E8F5]");
    name.textContent = entry.displayName;
    nameBlock.appendChild(name);

    if (entry.lastMatchAt) {
      const lastPlayed = createElement("span", "text-[10px] uppercase tracking-[0.35em] text-[#6D7390]");
      lastPlayed.textContent = new Date(entry.lastMatchAt).toLocaleDateString();
      nameBlock.appendChild(lastPlayed);
    }

    appendChildren(topRow, [rankPill, avatar, nameBlock]);

    const metricsRow = createDiv("flex flex-wrap items-center gap-2 text-xs text-[#8D93B5]");
    const totalGames = entry.wins + entry.losses;
    const winRate = totalGames > 0 ? Math.round((entry.wins / totalGames) * 100) : 0;
    metricsRow.appendChild(createMetricsBadge(`${entry.wins}W`, "bg-[#00C8FF]/15 text-[#00C8FF] border border-[#00C8FF]/40"));
    metricsRow.appendChild(createMetricsBadge(`${entry.losses}L`, "bg-[#FF008C]/15 text-[#FF008C] border border-[#FF008C]/40"));
    metricsRow.appendChild(createMetricsBadge(`${winRate}%`, "bg-[#1f2238] text-[#B7BCD9] border border-[#2A2E4A]/60"));

    if (entry.currentStreak > 0) {
      const streakBadge = createMetricsBadge(`STREAK ${entry.currentStreak}`, "bg-[#FF008C]/18 text-[#FF7AC3] border border-[#FF008C]/50");
      streakBadge.classList.add("text-[10px]", "uppercase", "tracking-[0.4em]");
      metricsRow.appendChild(streakBadge);
    }

    appendChildren(item, [topRow, metricsRow]);
    leaderboardList.appendChild(item);
  });
}

// Update recent matches with real data
function updateRecentMatchesDisplay(): void {
  const matchesList = document.querySelector('[data-matches-list]');
  if (!matchesList) return;

  matchesList.innerHTML = '';
  matchesList.setAttribute('data-scroll-ready', 'true');
  (matchesList as HTMLElement).style.setProperty('overflow-y', 'hidden');

  if (!currentRecentMatches.length) {
    const emptyState = createElement(
      "p",
      "flex h-32 w-full items-center justify-center rounded-lg border border-dashed border-[color:var(--border)]/40 text-sm text-[color:var(--muted-foreground)]"
    );
    emptyState.textContent = "No matches have been played yet.";
    matchesList.appendChild(emptyState);
    return;
  }

  const matchesToRender = currentRecentMatches.slice(0, 20);

  matchesToRender.forEach((match) => {
    const matchItem = createDiv(
      "group relative flex w-full shrink-0 snap-start flex-col gap-4 rounded border border-[#00C8FF]/25 bg-[#121216] px-5 py-4 text-[#F4F5F7] transition-all duration-200 hover:-translate-y-1 hover:border-[#00C8FF]/70 hover:shadow-[0_18px_45px_rgba(0,200,255,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-[#070910]focus-visible:ring-[#00C8FF] focus-visible:ring-offset-2"
    );
    matchItem.setAttribute('tabindex', '0');
    matchItem.setAttribute('role', 'listitem');

    const topRow = createDiv("flex items-start justify-between gap-4");



    const winnerInitials = match.winnerName.substring(0, 2).toUpperCase();
    const loserInitials = match.loserName.substring(0, 2).toUpperCase();

    const avatarStack = createDiv("flex items-center");
    const winnerAvatar = createAvatar(winnerInitials, "h-10 w-10", match.winnerAvatarUrl ?? null, "border-[#00C8FF]");
    winnerAvatar.classList.remove("bg-[#00C8FF]/10");
    winnerAvatar.classList.add("bg-[#00C8FF]/18", "shadow-[0_0_12px_rgba(0,200,255,0.35)]", "ring-2", "ring-[#00C8FF]/35");

    const loserAvatar = createAvatar(loserInitials, "h-9 w-9", match.loserAvatarUrl ?? null, "border-[#FF008C]");
    loserAvatar.classList.remove("bg-[#00C8FF]/10");
    loserAvatar.classList.add("bg-[#FF008C]/15", "-ml-3", "shadow-[0_0_10px_rgba(255,0,140,0.28)]", "ring-2", "ring-[#FF008C]/25");

    appendChildren(avatarStack, [winnerAvatar, loserAvatar]);

    const matchInfo = createDiv("flex min-w-0 flex-1 flex-col gap-1");
    const nameRow = createDiv("flex flex-wrap items-center gap-2 text-sm font-semibold");

    const winnerName = createElement("span", "max-w-[10rem] truncate text-[#F4F5F7]");
    winnerName.textContent = match.winnerName;
    const vsDivider = createElement("span", "text-[10px] tracking-[0.35em] text-[#8C90A6]");
    vsDivider.textContent = "VS";
    const loserName = createElement("span", "max-w-[10rem] truncate text-[#A1A4BB]");
    loserName.textContent = match.loserName;

    appendChildren(nameRow, [winnerName, vsDivider, loserName]);

    const metadataRow = createDiv("flex flex-wrap items-center gap-2 text-xs text-[#8D93B5]");
    const scoreBadge = createMetricsBadge(`${match.p1Score} - ${match.p2Score}`, "bg-[#1f2238] text-[#00C8FF] border border-[#00C8FF]/40");
    const timestamp = createElement(
      "span",
      "uppercase tracking-[0.35em] text-[10px] text-[#6D7390]"
    );
    timestamp.textContent = new Date(match.playedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    appendChildren(metadataRow, [scoreBadge, timestamp]);

    appendChildren(matchInfo, [nameRow, metadataRow]);
    appendChildren(topRow, [avatarStack, matchInfo]);

    const isUserWinner = match.winnerId === currentUserProfile?.userId;
    const badge = createBadge(
      isUserWinner ? 'YOU WON' : `${match.winnerName} WON`,
      isUserWinner
        ? "uppercase tracking-[0.35em] !text-[0.625rem] font-semibold bg-[#00C8FF]/18 text-[#00C8FF] border border-[#00C8FF]/70"
        : "uppercase tracking-[0.35em] !text-[0.625rem] font-semibold bg-[#FF008C]/18 text-[#FF008C] border border-[#FF008C]/60"
    );
    badge.classList.add("self-start", "rounded-full", "px-3", "py-1", "transition-colors", "shadow-[0_0_12px_rgba(0,0,0,0.25)]");

    appendChildren(matchItem, [topRow, badge]);
    matchesList.appendChild(matchItem);
  });
}

export function createHomePage(): HTMLElement {
  const container = createDiv("min-h-screen w-full bg-[#121217] pt-16");
  const innerContainer = createDiv("container mx-auto px-4 py-8 max-w-7xl");
  const grid = createDiv("grid grid-cols-1 gap-6 lg:grid-cols-12");

  // LEFT SIDEBAR - User Profile & Actions
  const leftSidebar = createDiv("lg:col-span-3 space-y-6");

  // Profile Card
  const profileCard = createDiv("border border-[#00C8FF] bg-[#1a1a24] p-6 rounded shadow-[0_0_15px_rgba(0,200,255,0.2)]");
  const profileContent = createDiv("space-y-4");
  const profileTop = createDiv("flex flex-col items-center gap-3");
  
  const avatarContainer = createDiv("");
  avatarContainer.setAttribute('data-profile-avatar', '');
  // Placeholder avatar (will be replaced by loadDashboardData)
  avatarContainer.appendChild(createAvatar("...", "h-20 w-20 border-2 shadow-[0_0_15px_rgba(0,200,255,0.5)]"));
  profileTop.appendChild(avatarContainer);
  
  const profileInfo = createDiv("text-center");
  const profileName = createElement("h3", "text-[#00C8FF] text-lg font-bold");
  profileName.textContent = "Loading...";
  profileName.setAttribute('data-profile-name', '');
  
  const statsPreview = createDiv("flex gap-4 justify-center mt-2 text-sm");
  const winsDiv = createDiv("text-center");
  const winsValue = createElement("div", "text-[#00C8FF] font-bold");
  winsValue.textContent = "0";
  winsValue.setAttribute('data-stat-wins', '');
  const winsLabel = createElement("div", "text-[#E0E0E0]/60 text-xs");
  winsLabel.textContent = "Wins";
  appendChildren(winsDiv, [winsValue, winsLabel]);
  
  const lossesDiv = createDiv("text-center");
  const lossesValue = createElement("div", "text-[#FF008C] font-bold");
  lossesValue.textContent = "0";
  lossesValue.setAttribute('data-stat-losses', '');
  const lossesLabel = createElement("div", "text-[#E0E0E0]/60 text-xs");
  lossesLabel.textContent = "Losses";
  appendChildren(lossesDiv, [lossesValue, lossesLabel]);
  
  appendChildren(statsPreview, [winsDiv, lossesDiv]);
  appendChildren(profileInfo, [profileName, statsPreview]);
  profileTop.appendChild(profileInfo);
  
  const viewProfileBtn = createButton(
    "View Full Profile",
    "w-full border border-[#00C8FF]/50 bg-transparent text-[#E0E0E0] hover:bg-[#00C8FF]/10 hover:border-[#00C8FF] px-4 py-2 rounded transition-colors",
    () => {
      void navigate('/profile');
    }
  );
  
  appendChildren(profileContent, [profileTop, viewProfileBtn]);
  profileCard.appendChild(profileContent);

  const gameActionsCard = createDiv("border border-[#00C8FF] bg-[#1a1a24] p-6 rounded shadow-[0_0_15px_rgba(0,200,255,0.2)]");
  const actionsHeader = createElement("h3", "text-[#00C8FF] text-center font-bold mb-4");
  actionsHeader.textContent = "Jump Into A Game";

  const actions = [
    {
      label: 'Play vs A.I. Bot',
      icon: 'cpu' as const,
      description: 'Solo practice against our adaptive A.I. sparring partner.',
      mode: 'bot' as const,
    },
    {
      label: 'Play Local',
      icon: 'users' as const,
      description: 'Two players on one screen using W/S and Arrow keys.',
      mode: 'local' as const,
    },
    {
      label: 'Multiplayer Match',
      icon: 'globe' as const,
      description: 'Quickmatch against online opponents.',
      mode: 'multiplayer' as const,
    },
  ];

  const actionsList = createDiv("space-y-3");

  const queueMode = (mode: 'bot' | 'local' | 'multiplayer') => {
    sessionStorage.setItem('queuedPlayMode', mode);
    void navigate('/arena');
  };

  actions.forEach((action) => {
    const button = createButton(
      '',
      'w-full flex flex-col items-start gap-2 rounded border border-[#00C8FF]/30 bg-[#121216]/80 p-5 text-left transition-colors hover:border-[#00C8FF]/60 hover:bg-[#141b33]',
      () => {
        queueMode(action.mode);
      }
    );

    const header = createDiv('flex w-full items-center justify-between');
    const title = createElement('span', 'text-base font-semibold text-[#E0E0E0]');
    title.textContent = action.label;
    header.appendChild(title);
    header.appendChild(createIcon(action.icon, 'h-5 w-5 text-[#00C8FF]'));

    const description = createElement('p', 'text-xs text-[#E0E0E0]/60');
    description.textContent = action.description;

    button.appendChild(header);
    button.appendChild(description);
    actionsList.appendChild(button);
  });

  appendChildren(gameActionsCard, [actionsHeader, actionsList]);

  // Quick Stats Card
  const statsCard = createDiv("border border-[#00C8FF]/50 bg-[#1a1a24] p-6 rounded");
  const statsHeader = createDiv("flex items-center justify-between mb-4");
  const statsTitle = createElement("h3", "text-[#E0E0E0] font-bold");
  statsTitle.textContent = "Quick Stats";
  statsHeader.appendChild(statsTitle);
  statsHeader.appendChild(createIcon("trendingUp", "h-5 w-5 text-[#00C8FF]"));
  
  const statsContent = createDiv("space-y-3");
  
  const stats = [
    { label: "Win Rate", value: "Loading...", color: "text-[#00C8FF]", attr: "data-stat-winrate", icon: "target" },
    { label: "Total Games", value: "Loading...", color: "text-[#E0E0E0]", attr: "data-stat-games", icon: "hash" },
    { label: "Win Streak", value: "Loading...", color: "text-[#FF008C]", attr: "data-stat-streak", icon: "zap" },
  ];

  stats.forEach(stat => {
    const row = createDiv("flex justify-between items-center p-2 rounded hover:bg-[#121217] transition-colors");
    const leftSide = createDiv("flex items-center gap-2");
    leftSide.appendChild(createIcon(stat.icon as any, "h-4 w-4 text-[#00C8FF]/60"));
    const label = createElement("span", "text-[#E0E0E0]/80");
    label.textContent = stat.label;
    leftSide.appendChild(label);
    
    const value = createElement("span", `${stat.color} font-bold`);
    value.textContent = stat.value;
    value.setAttribute(stat.attr, "");
    appendChildren(row, [leftSide, value]);
    statsContent.appendChild(row);
  });

  appendChildren(statsCard, [statsHeader, statsContent]);
  appendChildren(leftSidebar, [profileCard, gameActionsCard]);

  // CENTER CONTENT
  const centerContent = createDiv("lg:col-span-6 space-y-6");

  // Welcome Banner
  const welcomeBanner = createDiv("border border-[#00C8FF] bg-gradient-to-br from-[#1a1a24] to-[#121217] p-6 rounded shadow-[0_0_15px_rgba(0,200,255,0.2)]");
  const welcomeContent = createDiv("space-y-2");
  const welcomeTitle = createElement("h1", "text-[#00C8FF] text-2xl font-bold");
  welcomeTitle.textContent = "Welcome to the Arena";
  
  const welcomeNameContainer = createDiv("flex items-center gap-2");
  const welcomeGreeting = createElement("span", "text-[#E0E0E0]/80");
  welcomeGreeting.textContent = "Hello,";
  const welcomeName = createElement("span", "text-[#00C8FF] font-bold");
  welcomeName.textContent = "Player";
  welcomeName.setAttribute('data-welcome-name', '');
  appendChildren(welcomeNameContainer, [welcomeGreeting, welcomeName]);
  
  const welcomeText = createElement("p", "text-[#E0E0E0]/60 text-sm");
  welcomeText.textContent = "Ready to dominate the leaderboard?";
  appendChildren(welcomeContent, [welcomeTitle, welcomeNameContainer, welcomeText]);
  welcomeBanner.appendChild(welcomeContent);

  // Recent Matches
  const matchesCard = createDiv(
    "relative overflow-hidden rounded border border-[#00C8FF]/50 bg-[#1a1a24] p-6 shadow-[0_0_15px_rgba(0,200,255,0.15)]"
  );
  const matchesHeader = createDiv(
    "flex flex-wrap items-center justify-between gap-3 mb-4"
  );
  const matchesTitle = createElement("h3", "text-[#E0E0E0] text-lg font-semibold");
  matchesTitle.textContent = "Recent Matches";
  matchesHeader.appendChild(matchesTitle);
  matchesHeader.appendChild(createIcon("trophy", "h-5 w-5 text-[#00C8FF]"));

  const matchesList = createDiv(
    "no-scrollbar flex flex-col gap-3 overflow-x-auto overscroll-x-contain scroll-smooth snap-x snap-mandatory pb-1 -mx-3 px-3"
  );
  matchesList.setAttribute("data-matches-list", "");
  matchesList.setAttribute("role", "list");
  matchesList.setAttribute("aria-label", "Recent matches");
  matchesList.style.setProperty("-webkit-overflow-scrolling", "touch");
  matchesList.style.setProperty("scrollbar-width", "none");
  
  // Loading placeholder
  const loadingText = createElement(
    "p",
    "flex h-32 w-full items-center justify-center rounded-lg border border-dashed border-[color:var(--border)]/40 text-sm text-[color:var(--muted-foreground)]"
  );
  loadingText.textContent = "Loading matches...";
  matchesList.appendChild(loadingText);

  appendChildren(matchesCard, [matchesHeader, matchesList]);
  appendChildren(centerContent, [welcomeBanner, matchesCard]);

  // RIGHT SIDEBAR - Leaderboard
  const rightSidebar = createDiv("lg:col-span-3 space-y-6");

  const friendRequestsCard = createDiv("border border-[#00C8FF]/40 bg-[#1a1a24] p-6 rounded");
  const friendHeader = createDiv("flex flex-wrap items-center justify-between gap-2 mb-4");
  const friendHeaderLeft = createDiv("flex items-center gap-2");
  const friendTitle = createElement("h3", "text-[#E0E0E0] text-lg font-semibold");
  friendTitle.textContent = "Friend Requests";
  friendHeaderLeft.appendChild(friendTitle);
  friendHeaderLeft.appendChild(createIcon("users", "h-5 w-5 text-[#00C8FF]"));
  friendHeader.appendChild(friendHeaderLeft);
  friendRequestsCard.appendChild(friendHeader);

  const friendBody = createDiv("space-y-5");

  const searchSection = createDiv("space-y-2");
  const searchTitle = createElement("h4", "text-xs uppercase tracking-[0.35em] text-[#00C8FF]/70");
  searchTitle.textContent = "Find Players";

  const searchForm = document.createElement("form");
  searchForm.className = "flex flex-col gap-2";

  const searchInput = createInput(
    "text",
    "flex-1 rounded border border-[#00C8FF]/40 bg-[#0e101b] px-3 py-2 text-sm text-[#E0E0E0] placeholder:text-[#E0E0E0]/40 focus:border-[#00C8FF] focus:outline-none focus:ring-1 focus:ring-[#00C8FF]",
    "Search by name or email"
  );
  // createInput sets type attribute automatically but we ensure correct placeholder.
  searchInput.value = friendSearchQuery;

  const searchButton = createButton(
    "Search",
    "w-full rounded border border-[#00C8FF]/50 bg-[#00C8FF]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-[#00C8FF] transition-colors hover:bg-[#00C8FF]/20"
  );
  searchButton.type = "submit";

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = searchInput.value.trim();
    searchInput.value = value;
    void performFriendSearch(value);
  });

  searchInput.addEventListener("input", () => {
    const value = searchInput.value;
    if (value.trim().length < 2) {
      friendSearchQuery = value.trim();
      friendSearchResults = [];
      friendSearchError = null;
      friendSearchLoading = false;
      renderFriendSearch();
    }
  });

  const searchStatus = createElement("p", "text-xs text-[#E0E0E0]/60");
  searchStatus.setAttribute("data-friend-search-status", "");
  searchStatus.textContent = "Enter at least 2 characters to search.";

  const searchResultsList = createDiv("space-y-2");
  searchResultsList.setAttribute("data-friend-search-results", "");

  appendChildren(searchForm, [searchInput, searchButton]);
  appendChildren(searchSection, [searchTitle, searchForm, searchStatus, searchResultsList]);

  const incomingSection = createDiv("space-y-2");
  const incomingTitle = createElement("h4", "text-xs uppercase tracking-[0.35em] text-[#00C8FF]/70");
  incomingTitle.textContent = "Incoming";
  const incomingList = createDiv("space-y-2");
  incomingList.setAttribute("data-friend-requests-incoming", "");
  incomingSection.appendChild(incomingTitle);
  incomingSection.appendChild(incomingList);

  const outgoingSection = createDiv("space-y-2");
  const outgoingTitle = createElement("h4", "text-xs uppercase tracking-[0.35em] text-[#00C8FF]/70");
  outgoingTitle.textContent = "Requests Sent";
  const outgoingList = createDiv("space-y-2");
  outgoingList.setAttribute("data-friend-requests-outgoing", "");
  outgoingSection.appendChild(outgoingTitle);
  outgoingSection.appendChild(outgoingList);

  appendChildren(friendBody, [searchSection, incomingSection, outgoingSection]);
  friendRequestsCard.appendChild(friendBody);

  // Leaderboard Card
  const leaderboardCard = createDiv("border border-[#00C8FF]/50 bg-[#1a1a24] p-6 rounded");
  const leaderboardHeader = createDiv("flex flex-wrap items-center justify-between gap-3 mb-4");
  const leaderboardTitleWrap = createDiv("flex items-center gap-2");
  const leaderboardTitle = createElement("h3", "text-[#E0E0E0] text-lg font-semibold");
  leaderboardTitle.textContent = "Top Players";
  leaderboardTitleWrap.appendChild(leaderboardTitle);
  leaderboardTitleWrap.appendChild(createIcon("trophy", "h-5 w-5 text-[#00C8FF]"));

  const leaderboardActions = createDiv("flex items-center gap-2 text-xs text-[#00C8FF]/80");
  const globalBadge = createDiv("flex items-center gap-1 rounded-full border border-[#00C8FF]/40 px-3 py-1 bg-[#121427]");
  globalBadge.appendChild(createIcon("globe", "h-3 w-3 text-[#00C8FF]/80"));
  globalBadge.appendChild(createElement("span", "uppercase tracking-[0.4em]", { }));
  globalBadge.lastChild!.textContent = "GLOBAL";
  leaderboardActions.appendChild(globalBadge);

  leaderboardHeader.appendChild(leaderboardTitleWrap);
  leaderboardHeader.appendChild(leaderboardActions);
  
  const leaderboardList = createDiv("space-y-2");
  leaderboardList.setAttribute("data-leaderboard-list", "");
  
  // Loading placeholder
  const leaderboardLoading = createElement("p", "text-[#E0E0E0]/60 text-center py-4");
  leaderboardLoading.textContent = "Loading leaderboard...";
  leaderboardList.appendChild(leaderboardLoading);
  
  appendChildren(leaderboardCard, [leaderboardHeader, leaderboardList]);
  appendChildren(rightSidebar, [friendRequestsCard, statsCard, leaderboardCard]);

  appendChildren(grid, [leftSidebar, centerContent, rightSidebar]);
  innerContainer.appendChild(grid);
  container.appendChild(innerContainer);

  dashboardUnsubscribe?.();
  dashboardUnsubscribe = dashboardState.subscribe(handleDashboardState);
  handleDashboardState(dashboardState.getState());
  renderFriendRequests();

  // Load dashboard data from API
  loadDashboardData();

  return container;
}
