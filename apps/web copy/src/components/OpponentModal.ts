import { createIcon } from "../utils/icons";

/**
 * OpponentModal - UI for selecting an opponent from online players
 * Displays a list of online players with search functionality
 */

export interface OnlinePlayer {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  elo: number;
  status: "online" | "in-game";
}

interface OpponentModalConfig {
  players: OnlinePlayer[];
  onChallenge: (opponentId: string) => void;
  onClose: () => void;
}

let modalContainer: HTMLElement | null = null;

/**
 * Create avatar element (image or initials fallback)
 */
function createAvatar(
  displayName: string,
  avatarUrl: string | null,
  size: string = "h-12 w-12"
): HTMLElement {
  const container = document.createElement("div");
  container.className = `${size} rounded-full overflow-hidden flex items-center justify-center bg-gradient-to-br from-[#00C8FF] to-[#7B2BFF] text-white font-semibold flex-shrink-0`;

  if (avatarUrl) {
    const img = document.createElement("img");
    img.src = avatarUrl;
    img.alt = displayName;
    img.className = "w-full h-full object-cover";
    img.onerror = () => {
      // Fallback to initials if image fails
      const initials = displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
      container.innerHTML = `<span class="text-sm">${initials}</span>`;
    };
    container.appendChild(img);
  } else {
    // Use initials
    const initials = displayName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
    container.innerHTML = `<span class="text-sm">${initials}</span>`;
  }

  return container;
}

/**
 * Create status badge
 */
function createStatusBadge(status: "online" | "in-game"): HTMLElement {
  const badge = document.createElement("span");
  badge.className = `px-2 py-1 rounded-full text-xs font-medium ${
    status === "online"
      ? "bg-green-500/20 text-green-400"
      : "bg-yellow-500/20 text-yellow-400"
  }`;
  badge.textContent = status === "online" ? "Online" : "In Game";
  return badge;
}

/**
 * Create player list item
 */
function createPlayerItem(
  player: OnlinePlayer,
  onChallenge: (opponentId: string) => void
): HTMLElement {
  const item = document.createElement("div");
  item.className =
    "flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 hover:border-[#00C8FF]/40 transition-all";

  // Left section: Avatar + Info
  const leftSection = document.createElement("div");
  leftSection.className = "flex items-center gap-3 flex-1";

  const avatar = createAvatar(player.displayName, player.avatarUrl);
  leftSection.appendChild(avatar);

  const info = document.createElement("div");
  info.className = "flex flex-col gap-1";

  const name = document.createElement("div");
  name.className = "font-semibold text-white";
  name.textContent = player.displayName;
  info.appendChild(name);

  const details = document.createElement("div");
  details.className = "flex items-center gap-2 text-sm";

  const eloText = document.createElement("span");
  eloText.className = "text-gray-400";
  eloText.innerHTML = `${createIcon(
    "trophy",
    "h-3 w-3 inline"
  ).outerHTML} ELO: ${player.elo}`;
  details.appendChild(eloText);

  const statusBadge = createStatusBadge(player.status);
  details.appendChild(statusBadge);

  info.appendChild(details);
  leftSection.appendChild(info);

  // Right section: Challenge button
  const challengeBtn = document.createElement("button");
  challengeBtn.className = `px-4 py-2 rounded-lg font-medium transition-all ${
    player.status === "in-game"
      ? "bg-gray-600 text-gray-400 cursor-not-allowed"
      : "bg-gradient-to-r from-[#00C8FF] to-[#7B2BFF] text-white hover:shadow-lg hover:shadow-[#00C8FF]/50"
  }`;
  challengeBtn.textContent = "Challenge";
  challengeBtn.disabled = player.status === "in-game";

  if (player.status !== "in-game") {
    challengeBtn.addEventListener("click", () => {
      onChallenge(player.userId);
    });
  }

  item.appendChild(leftSection);
  item.appendChild(challengeBtn);

  return item;
}

/**
 * Create empty state
 */
function createEmptyState(): HTMLElement {
  const container = document.createElement("div");
  container.className = "flex flex-col items-center justify-center py-12 text-center";

  const icon = createIcon("users", "h-16 w-16 text-gray-600 mb-4");
  container.appendChild(icon);

  const title = document.createElement("h3");
  title.className = "text-xl font-semibold text-white mb-2";
  title.textContent = "No Players Online";
  container.appendChild(title);

  const description = document.createElement("p");
  description.className = "text-gray-400";
  description.textContent = "Check back later or invite friends to play!";
  container.appendChild(description);

  return container;
}

/**
 * Show opponent selection modal
 */
export function showOpponentModal(config: OpponentModalConfig): void {
  // Remove existing modal if any
  if (modalContainer) {
    modalContainer.remove();
  }

  // Create modal container
  modalContainer = document.createElement("div");
  modalContainer.className =
    "fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4";
  modalContainer.setAttribute("data-modal", "opponent-selector");

  // Modal content
  const modal = document.createElement("div");
  modal.className =
    "bg-gradient-to-br from-[#1a1a2e] to-[#0f0f1e] border border-white/20 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col";

  // Header
  const header = document.createElement("div");
  header.className = "flex items-center justify-between p-6 border-b border-white/10";

  const title = document.createElement("h2");
  title.className = "text-2xl font-bold text-white flex items-center gap-2";
  const usersIcon = createIcon("users", "h-6 w-6 text-[#00C8FF]");
  title.appendChild(usersIcon);
  title.appendChild(document.createTextNode("Select Opponent"));
  header.appendChild(title);

  const closeBtn = document.createElement("button");
  closeBtn.className =
    "text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10";
  closeBtn.appendChild(createIcon("x", "h-6 w-6"));
  closeBtn.addEventListener("click", () => {
    config.onClose();
    closeModal();
  });
  header.appendChild(closeBtn);

  modal.appendChild(header);

  // Search bar
  const searchContainer = document.createElement("div");
  searchContainer.className = "p-6 border-b border-white/10";

  const searchWrapper = document.createElement("div");
  searchWrapper.className = "relative";

  const searchIcon = createIcon("search", "h-5 w-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2");
  searchWrapper.appendChild(searchIcon);

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search players...";
  searchInput.className =
    "w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-[#00C8FF] transition-colors";
  searchInput.setAttribute("data-search-input", "");
  searchWrapper.appendChild(searchInput);

  searchContainer.appendChild(searchWrapper);
  modal.appendChild(searchContainer);

  // Player count
  const countContainer = document.createElement("div");
  countContainer.className = "px-6 pt-4 pb-2";
  const countText = document.createElement("p");
  countText.className = "text-sm text-gray-400";
  countText.setAttribute("data-player-count", "");
  countText.textContent = `${config.players.length} player${
    config.players.length !== 1 ? "s" : ""
  } online`;
  countContainer.appendChild(countText);
  modal.appendChild(countContainer);

  // Player list (scrollable)
  const playerList = document.createElement("div");
  playerList.className = "flex-1 overflow-y-auto px-6 pb-6 space-y-3";
  playerList.setAttribute("data-player-list", "");

  if (config.players.length === 0) {
    playerList.appendChild(createEmptyState());
  } else {
    config.players.forEach((player) => {
      const item = createPlayerItem(player, config.onChallenge);
      item.setAttribute("data-player-name", player.displayName.toLowerCase());
      playerList.appendChild(item);
    });
  }

  modal.appendChild(playerList);

  // Search functionality
  let filteredCount = config.players.length;
  searchInput.addEventListener("input", (e) => {
    const searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
    const items = playerList.querySelectorAll("[data-player-name]");
    filteredCount = 0;

    items.forEach((item) => {
      const playerName = item.getAttribute("data-player-name") || "";
      if (playerName.includes(searchTerm)) {
        (item as HTMLElement).style.display = "flex";
        filteredCount++;
      } else {
        (item as HTMLElement).style.display = "none";
      }
    });

    // Update count
    countText.textContent = `${filteredCount} player${
      filteredCount !== 1 ? "s" : ""
    } found`;

    // Show empty state if no results
    const existingEmpty = playerList.querySelector("[data-empty-state]");
    if (filteredCount === 0 && !existingEmpty) {
      const emptyState = document.createElement("div");
      emptyState.setAttribute("data-empty-state", "");
      emptyState.className = "text-center py-8 text-gray-400";
      emptyState.textContent = `No players found matching "${searchTerm}"`;
      playerList.appendChild(emptyState);
    } else if (filteredCount > 0 && existingEmpty) {
      existingEmpty.remove();
    }
  });

  // Add modal to container
  modalContainer.appendChild(modal);

  // Close on backdrop click
  modalContainer.addEventListener("click", (e) => {
    if (e.target === modalContainer) {
      config.onClose();
      closeModal();
    }
  });

  // Close on Escape key
  const escapeHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      config.onClose();
      closeModal();
      document.removeEventListener("keydown", escapeHandler);
    }
  };
  document.addEventListener("keydown", escapeHandler);

  // Add to DOM
  document.body.appendChild(modalContainer);

  // Focus search input
  setTimeout(() => searchInput.focus(), 100);
}

/**
 * Close and remove modal
 */
function closeModal(): void {
  if (modalContainer) {
    modalContainer.remove();
    modalContainer = null;
  }
}

/**
 * Export for programmatic closing
 */
export function closeOpponentModal(): void {
  closeModal();
}
