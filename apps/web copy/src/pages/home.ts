import { createDiv, createElement, createButton, appendChildren } from "../utils/dom";
import { createIcon } from "../utils/icons";
import { appState } from "../utils/state";
import { getUserId } from "../lib/auth";
import { dashboardState } from "../features/home/state";
import { getUserProfile, getOnlineUsers } from "../lib/api-client";
import type { UserStats, LeaderboardEntry, UserProfile } from "../lib/api-client";
import { showOpponentModal, closeOpponentModal } from "../components/OpponentModal";
import { showError } from "../components/Modal";
import { invitationManager } from "../features/invitations/InvitationManager";

// Current dashboard data
let currentUserStats: UserStats | null = null;
let currentLeaderboard: LeaderboardEntry[] = [];
let currentUserProfile: UserProfile | null = null;

function createAvatar(
  initials: string,
  size: string = "h-10 w-10",
  avatarUrl: string | null = null
): HTMLElement {
  const avatar = createDiv(
    `${size} rounded-full border border-[#00C8FF]/50 bg-[#00C8FF]/10 flex items-center justify-center overflow-hidden`
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

function createBadge(text: string, className: string): HTMLElement {
  const badge = createElement("span", `px-2 py-1 rounded text-sm ${className}`);
  badge.textContent = text;
  return badge;
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
    
    // Get the current state
    const state = dashboardState.getState();
    currentUserStats = state.userStats;
    currentLeaderboard = state.leaderboard;
    
    // Update the UI
    updateDashboardDisplay();

    // T072: Set up auto-refresh after returning from matches
    // Listen for page navigation back to home to refresh stats
    const originalSetState = appState.setState.bind(appState);
    appState.setState = (newState: any) => {
      const oldPage = appState.getState().currentPage;
      originalSetState(newState);
      const newPage = newState.currentPage;
      
      // If returning to home from play page, refresh dashboard
      if (oldPage === 'play' && newPage === 'home') {
        console.log('Refreshing dashboard after match...');
        loadDashboardData();
      }
    };
  } catch (error) {
    console.error('Failed to load dashboard data:', error);
  }
}

// Update dashboard display with real data
function updateDashboardDisplay(): void {
  if (!currentUserStats) return;

  // Update Quick Stats
  const totalGames = currentUserStats.wins + currentUserStats.losses;
  const winRate = totalGames > 0
    ? Math.round((currentUserStats.wins / totalGames) * 100)
    : 0;
  
  const winRateEl = document.querySelector('[data-stat-winrate]');
  if (winRateEl) winRateEl.textContent = `${winRate}%`;
  
  const gamesEl = document.querySelector('[data-stat-games]');
  if (gamesEl) gamesEl.textContent = totalGames.toString();
  
  const streakEl = document.querySelector('[data-stat-streak]');
  if (streakEl) streakEl.textContent = currentUserStats.streak.toString();

  const winsEl = document.querySelector('[data-stat-wins]');
  if (winsEl) winsEl.textContent = currentUserStats.wins.toString();
  
  const lossesEl = document.querySelector('[data-stat-losses]');
  if (lossesEl) lossesEl.textContent = currentUserStats.losses.toString();

  // Update user profile info
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

  // Update Leaderboard
  updateLeaderboardDisplay();

  // Update Recent Matches
  updateRecentMatchesDisplay();
}

// Update leaderboard with real data
function updateLeaderboardDisplay(): void {
  const leaderboardList = document.querySelector('[data-leaderboard-list]');
  if (!leaderboardList || currentLeaderboard.length === 0) return;

  leaderboardList.innerHTML = '';
  currentLeaderboard.forEach((entry, index) => {
    const item = createDiv("flex items-center justify-between p-3 rounded border border-[#00C8FF]/20 bg-[#121217] hover:border-[#00C8FF]/40 transition-colors cursor-pointer");
    
    const leftSide = createDiv("flex items-center gap-3");
    const rank = createElement("span", "text-[#00C8FF] font-bold w-8 text-lg");
    rank.textContent = `#${index + 1}`;
    leftSide.appendChild(rank);
    
    // Use avatar image if available
    const initials = entry.displayName.substring(0, 2).toUpperCase();
    leftSide.appendChild(createAvatar(initials, "h-10 w-10", entry.avatarUrl));
    
    const playerInfo = createDiv("flex-1");
    const name = createElement("p", "text-[#E0E0E0] font-medium");
    name.textContent = entry.displayName;
    const stats = createElement("p", "text-[#E0E0E0]/60 text-sm");
    const totalGames = entry.wins + entry.losses;
    const winRate = totalGames > 0 ? Math.round((entry.wins / totalGames) * 100) : 0;
    stats.textContent = `${entry.wins}W • ${entry.losses}L • ${winRate}% WR`;
    appendChildren(playerInfo, [name, stats]);
    leftSide.appendChild(playerInfo);
    
    // Show streak if > 0
    if (entry.currentStreak > 0) {
      const streakBadge = createDiv("flex items-center gap-1 px-2 py-1 rounded bg-[#FF008C]/20 border border-[#FF008C]");
      const streakIcon = createIcon("zap", "h-3 w-3 text-[#FF008C]");
      const streakText = createElement("span", "text-[#FF008C] text-xs font-bold");
      streakText.textContent = String(entry.currentStreak);
      appendChildren(streakBadge, [streakIcon, streakText]);
      item.appendChild(streakBadge);
    }
    
    appendChildren(item, [leftSide]);
    leaderboardList.appendChild(item);
  });
}

// Update recent matches with real data
function updateRecentMatchesDisplay(): void {
  const matchesList = document.querySelector('[data-matches-list]');
  if (!matchesList || !currentUserStats || !currentUserStats.recent) return;

  matchesList.innerHTML = '';
  currentUserStats.recent.slice(0, 5).forEach(match => {
    const matchItem = createDiv("flex items-center justify-between p-3 rounded border border-[#00C8FF]/20 bg-[#121217]");
    const leftSide = createDiv("flex items-center gap-3");
    
    // Use opponentId for now (TODO: fetch opponent display name in Phase 7D)
    const opponentName = match.opponentId ? `Player ${match.opponentId.substring(0, 6)}` : 'AI';
    leftSide.appendChild(createAvatar(opponentName.substring(0, 2).toUpperCase()));
    
    const matchInfo = createDiv();
    const name = createElement("p", "text-[#E0E0E0]");
    name.textContent = opponentName;
    const score = createElement("p", "text-[#E0E0E0]/60");
    score.textContent = `${match.p1Score}-${match.p2Score}`;
    appendChildren(matchInfo, [name, score]);
    leftSide.appendChild(matchInfo);
    
    const badge = createBadge(
      match.outcome.toUpperCase(),
      match.outcome === "win"
        ? "bg-[#00C8FF]/20 text-[#00C8FF] border border-[#00C8FF]"
        : "bg-[#FF008C]/20 text-[#FF008C] border border-[#FF008C]"
    );
    
    appendChildren(matchItem, [leftSide, badge]);
    matchesList.appendChild(matchItem);
  });
}

export function createHomePage(): HTMLElement {
  const container = createDiv("min-h-screen w-full bg-[#121217] pt-16");
  const innerContainer = createDiv("container mx-auto px-4 py-8 max-w-7xl");
  const grid = createDiv("grid grid-cols-1 lg:grid-cols-3 gap-6");

  // LEFT SIDEBAR - User Profile & Actions
  const leftSidebar = createDiv("lg:col-span-1 space-y-6");

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
    () => appState.setState({ currentPage: "profile" })
  );
  
  appendChildren(profileContent, [profileTop, viewProfileBtn]);
  profileCard.appendChild(profileContent);

  // Play Now Card
  const playCard = createDiv("border border-[#00C8FF] bg-[#1a1a24] p-6 rounded shadow-[0_0_15px_rgba(0,200,255,0.2)]");
  const playContent = createDiv("space-y-4");
  const playTitle = createElement("h3", "text-[#00C8FF] text-center font-bold mb-2");
  playTitle.textContent = "Quick Match";
  
  // T086: Integrated OpponentModal with online users API
  const playBtn = createButton(
    "",
    "w-full h-24 bg-gradient-to-r from-[#00C8FF] to-[#00A0CC] text-[#121217] hover:shadow-[0_0_25px_rgba(0,200,255,0.6)] shadow-[0_0_20px_rgba(0,200,255,0.4)] rounded-lg transition-all hover:scale-105 font-bold",
    async () => {
      try {
        // Fetch online users
        const onlineUsersResponse = await getOnlineUsers();
        
        if (onlineUsersResponse.total === 0) {
          showError("No Players Online", "No players are currently online. Try again later!");
          return;
        }

        // Show opponent selection modal
        showOpponentModal({
          players: onlineUsersResponse.players,
          onChallenge: async (opponentId: string) => {
            try {
              closeOpponentModal();
              await invitationManager.init();
              await invitationManager.sendInvite(opponentId);
            } catch (error) {
              showError("Invitation Error", `Failed to send invitation: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          },
          onClose: () => {
            // Modal closed without action
          },
        });
      } catch (error) {
        showError("Loading Error", `Failed to load online players: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  );
  const playBtnContent = createDiv("flex flex-col items-center gap-2");
  playBtnContent.appendChild(createIcon("play", "h-10 w-10"));
  const playText = createElement("span", "text-xl");
  playText.textContent = "PLAY NOW";
  playBtnContent.appendChild(playText);
  playBtn.appendChild(playBtnContent);

  const playDescription = createElement("p", "text-[#E0E0E0]/60 text-center text-sm");
  playDescription.textContent = "Choose an opponent from online players";

  appendChildren(playContent, [playTitle, playBtn, playDescription]);
  playCard.appendChild(playContent);

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
  appendChildren(leftSidebar, [profileCard, playCard, statsCard]);

  // CENTER CONTENT
  const centerContent = createDiv("lg:col-span-1 space-y-6");

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
  const matchesCard = createDiv("border border-[#00C8FF]/50 bg-[#1a1a24] p-6 rounded");
  const matchesHeader = createDiv("flex items-center justify-between mb-4");
  const matchesTitle = createElement("h3", "text-[#E0E0E0]");
  matchesTitle.textContent = "Recent Matches";
  matchesHeader.appendChild(matchesTitle);
  matchesHeader.appendChild(createIcon("trophy", "h-5 w-5 text-[#00C8FF]"));
  
  const matchesList = createDiv("space-y-3");
  matchesList.setAttribute("data-matches-list", "");
  
  // Loading placeholder
  const loadingText = createElement("p", "text-[#E0E0E0]/60 text-center py-4");
  loadingText.textContent = "Loading matches...";
  matchesList.appendChild(loadingText);

  appendChildren(matchesCard, [matchesHeader, matchesList]);
  appendChildren(centerContent, [welcomeBanner, matchesCard]);

  // RIGHT SIDEBAR - Leaderboard
  const rightSidebar = createDiv("lg:col-span-1 space-y-6");

  // Leaderboard Card
  const leaderboardCard = createDiv("border border-[#00C8FF]/50 bg-[#1a1a24] p-6 rounded");
  const leaderboardHeader = createDiv("flex items-center justify-between mb-4");
  const leaderboardTitle = createElement("h3", "text-[#E0E0E0] font-bold");
  leaderboardTitle.textContent = "Top Players";
  leaderboardHeader.appendChild(leaderboardTitle);
  leaderboardHeader.appendChild(createIcon("trophy", "h-5 w-5 text-[#00C8FF]"));
  
  const leaderboardList = createDiv("space-y-2");
  leaderboardList.setAttribute("data-leaderboard-list", "");
  
  // Loading placeholder
  const leaderboardLoading = createElement("p", "text-[#E0E0E0]/60 text-center py-4");
  leaderboardLoading.textContent = "Loading leaderboard...";
  leaderboardList.appendChild(leaderboardLoading);
  
  appendChildren(leaderboardCard, [leaderboardHeader, leaderboardList]);
  appendChildren(rightSidebar, [leaderboardCard]);

  appendChildren(grid, [leftSidebar, centerContent, rightSidebar]);
  innerContainer.appendChild(grid);
  container.appendChild(innerContainer);

  // Load dashboard data from API
  loadDashboardData();

  return container;
}
