import { clearAuth, getAccessToken, refreshAccessToken } from './auth';
import { getApiBaseUrl } from './api-base';

export const API_URL = getApiBaseUrl();

async function parseApiResponse<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.status === 205 || response.status === 304) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();

  if (!text) {
    return undefined as T;
  }

  if (contentType.includes('application/json')) {
    return JSON.parse(text) as T;
  }

  return text as unknown as T;
}

/**
 * Base fetch wrapper with authentication
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  attempt = 0
): Promise<T> {
  const token = getAccessToken();
  
  const headers: Record<string, string> = {};

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  // Add auth header if token exists
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Merge with custom headers
  if (options.headers) {
    Object.assign(headers, options.headers);
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && attempt === 0) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiFetch<T>(endpoint, options, attempt + 1);
    }
    clearAuth();
  }

  // Handle error responses
  if (!response.ok) {
    const fallbackMessage = response.statusText || `API Error: ${response.status}`;
    let message = fallbackMessage;

    try {
      const errorText = await response.text();
      if (errorText) {
        try {
          const data = JSON.parse(errorText) as { message?: string } | undefined;
          if (data?.message) {
            message = data.message;
          } else {
            message = errorText;
          }
        } catch {
          message = errorText;
        }
      }
    } catch {
      message = fallbackMessage;
    }

    throw new Error(message);
  }

  return parseApiResponse<T>(response);
}

// ============================================================================
// User Profile API
// ============================================================================

export interface UserProfile {
  userId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfileUpdate {
  displayName?: string;
  avatarUrl?: string | null;
  email?: string;
}

/**
 * Get user profile by userId
 */
export async function getUserProfile(userId: string): Promise<UserProfile> {
  return apiFetch<UserProfile>(`/users/${userId}`);
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  userId: string,
  data: UserProfileUpdate
): Promise<UserProfile> {
  return apiFetch<UserProfile>(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ============================================================================
// User Stats API
// ============================================================================

export interface RecentMatch {
  matchId: string;
  opponentId: string | null;
  p1Score: number;
  p2Score: number;
  outcome: 'win' | 'loss';
  ts: string;
}

export interface UserStats {
  userId: string;
  wins: number;
  losses: number;
  streak: number;
  lastResult: 'win' | 'loss' | null;
  updatedAt: string;
  recent: RecentMatch[];
}

/**
 * Get user statistics
 * @param userId - User ID
 * @param refresh - Force refresh from database (default: true)
 * @param limit - Number of recent matches to include (default: 10, max: 25)
 */
export async function getUserStats(
  userId: string,
  options?: { refresh?: boolean; limit?: number }
): Promise<UserStats> {
  const params = new URLSearchParams();
  
  if (options?.refresh !== undefined) {
    params.append('refresh', String(options.refresh));
  }
  
  if (options?.limit !== undefined) {
    params.append('limit', String(options.limit));
  }
  
  const query = params.toString();
  const endpoint = `/users/${userId}/stats${query ? `?${query}` : ''}`;
  
  return apiFetch<UserStats>(endpoint);
}

// ============================================================================
// Leaderboard API
// ============================================================================

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  wins: number;
  losses: number;
  winRate: number | null;
  currentStreak: number;
  lastResult: 'win' | 'loss' | null;
  lastMatchAt: string | null;
  updatedAt: string;
}

/**
 * Get leaderboard
 * @param limit - Number of entries to return (default: 10, max: 100)
 */
export async function getLeaderboard(limit: number = 10): Promise<LeaderboardEntry[]> {
  return apiFetch<LeaderboardEntry[]>(`/stats/leaderboard?limit=${limit}`);
}

export interface RecentMatchFeedItem {
  matchId: string;
  playedAt: string;
  p1Score: number;
  p2Score: number;
  winnerId: string;
  loserId: string;
  winnerName: string;
  loserName: string;
  winnerAvatarUrl: string | null;
  loserAvatarUrl: string | null;
}

export async function getRecentMatchesFeed(): Promise<RecentMatchFeedItem[]> {
  return apiFetch<RecentMatchFeedItem[]>(`/stats/recent-matches`);
}

/**
 * Calculate user's global rank from leaderboard
 * @param userId - User ID to find
 * @param leaderboard - Optional leaderboard data (will fetch if not provided)
 * @returns Rank number or null if not in top 100
 */
export async function getUserGlobalRank(
  userId: string,
  leaderboard?: LeaderboardEntry[]
): Promise<number | null> {
  // Fetch leaderboard if not provided (top 100)
  const board = leaderboard || await getLeaderboard(100);
  
  // Find user in leaderboard
  const entry = board.find(e => e.userId === userId);
  
  return entry ? entry.rank : null;
}

// ============================================================================
// Chat API (for Phase 7C)
// ============================================================================

export interface ChatChannel {
  id?: string;
  slug: string;
  title?: string;
  name?: string;
  description?: string;
  visibility?: 'public' | 'private';
  createdBy?: string;
  createdAt?: string;
  memberCount?: number;
  unreadCount?: number;
}

export interface ChatMessage {
  id: string;
  channelId: string | null;
  senderId: string;
  content: string;
  type: 'channel' | 'dm';
  dmTargetId: string | null;
  createdAt: string;
}

export interface ChatBlock {
  blockerId: string;
  blockedId: string;
  reason?: string | null;
  createdAt: string;
}

export interface ChatMembership {
  channelId: string;
  userId: string;
  role: 'member' | 'admin';
  joinedAt: string;
}

export interface CreateChannelRequest {
  title: string;
  visibility?: 'public' | 'private';
  slug?: string | null;
}

export interface CreateChannelResponse {
  channel: ChatChannel;
  membership: ChatMembership;
}

/**
 * Get list of available chat channels
 */
export async function getChannels(): Promise<ChatChannel[]> {
  return apiFetch<ChatChannel[]>('/chat/channels');
}

export async function createChannel(
  payload: CreateChannelRequest
): Promise<CreateChannelResponse> {
  return apiFetch<CreateChannelResponse>('/chat/channels', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteChannel(slug: string): Promise<void> {
  await apiFetch<void>(`/chat/channels/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
  });
}

export async function joinChannel(slug: string): Promise<ChatMembership> {
  return apiFetch<ChatMembership>(`/chat/channels/${encodeURIComponent(slug)}/join`, {
    method: 'POST',
  });
}

/**
 * Get channel message history
 */
export async function getChannelHistory(
  slug: string,
  limit: number = 50
): Promise<ChatMessage[]> {
  return apiFetch<ChatMessage[]>(`/chat/history?room=${slug}&limit=${limit}`);
}

/**
 * Send message to channel (REST fallback)
 */
export async function sendChannelMessage(
  slug: string,
  content: string
): Promise<ChatMessage> {
  return apiFetch<ChatMessage>(`/chat/channels/${slug}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

/**
 * Get direct message history with a user
 */
export async function getDMHistory(
  userId: string,
  limit: number = 50
): Promise<ChatMessage[]> {
  return apiFetch<ChatMessage[]>(`/chat/dm/${userId}?limit=${limit}`);
}

/**
 * Send direct message to user (REST fallback)
 */
export async function sendDM(
  userId: string,
  content: string
): Promise<ChatMessage> {
  return apiFetch<ChatMessage>(`/chat/dm/${userId}`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

/**
 * Get list of recent conversations
 */
export async function getConversations(limit: number = 20): Promise<any[]> {
  return apiFetch<any[]>(`/chat/conversations?limit=${limit}`);
}

/**
 * Block a user
 */
export async function blockUser(userId: string, reason?: string): Promise<void> {
  const payload = reason ? { reason } : {};
  await apiFetch<void>(`/chat/blocks/${userId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Unblock a user
 */
export async function unblockUser(userId: string): Promise<void> {
  await apiFetch<void>(`/chat/blocks/${userId}`, {
    method: 'DELETE',
  });
}

/**
 * Get list of blocked users
 */
export async function getBlockedUsers(): Promise<ChatBlock[]> {
  return apiFetch<ChatBlock[]>('/chat/blocks');
}

export async function isUserBlocked(userId: string): Promise<boolean> {
  const blocks = await getBlockedUsers();
  return blocks.some((block) => block.blockedId === userId);
}

// ============================================================================
// Online Users API (Phase 7D)
// ============================================================================

export interface OnlinePlayer {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  elo: number;
  status: 'online' | 'in-game';
}

export interface OnlineUsersResponse {
  players: OnlinePlayer[];
  total: number;
}

/**
 * Get list of online users (excluding current user)
 */
export async function getOnlineUsers(): Promise<OnlineUsersResponse> {
  return apiFetch<OnlineUsersResponse>('/users/online');
}

// ============================================================================
// Friend Requests API
// ============================================================================

export interface FriendRequestSummary {
  requestId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface FriendRequestsResponse {
  incoming: FriendRequestSummary[];
  outgoing: FriendRequestSummary[];
}

export interface FriendRequestCreateResponse extends FriendRequestsResponse {
  requestId: string;
}

export async function getFriendRequests(): Promise<FriendRequestsResponse> {
  return apiFetch<FriendRequestsResponse>('/users/me/friend-requests');
}

export async function getPublicProfile(userId: string): Promise<UserProfile> {
  return apiFetch<UserProfile>(`/users/${userId}`);
}

export async function acceptFriendRequest(requestId: string): Promise<FriendRequestsResponse> {
  return apiFetch<FriendRequestsResponse>(`/users/me/friend-requests/${requestId}/accept`, {
    method: 'POST',
  });
}

export async function declineFriendRequest(requestId: string): Promise<FriendRequestsResponse> {
  return apiFetch<FriendRequestsResponse>(`/users/me/friend-requests/${requestId}/decline`, {
    method: 'POST',
  });
}

export async function cancelFriendRequest(requestId: string): Promise<FriendRequestsResponse> {
  return apiFetch<FriendRequestsResponse>(`/users/me/friend-requests/${requestId}/cancel`, {
    method: 'POST',
  });
}

export async function sendFriendRequest(targetUserId: string): Promise<FriendRequestCreateResponse> {
  return apiFetch<FriendRequestCreateResponse>('/users/me/friend-requests', {
    method: 'POST',
    body: JSON.stringify({ targetUserId }),
  });
}

// =========================================================================
// User Search API
// =========================================================================

export type FriendRelationshipStatus =
  | 'self'
  | 'friend'
  | 'incoming-request'
  | 'outgoing-request'
  | 'none';

export interface UserSearchResult {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  relationship: FriendRelationshipStatus;
}

export interface UserSearchResponse {
  results: UserSearchResult[];
}

export async function searchUsers(term: string, limit: number = 10): Promise<UserSearchResponse> {
  const params = new URLSearchParams({ query: term.trim(), limit: String(limit) });
  return apiFetch<UserSearchResponse>(`/users/search?${params.toString()}`);
}

// ============================================================================
// Two-Factor Authentication API
// ============================================================================

export interface TwoFactorStatus {
  status: 'disabled' | 'pending' | 'active';
  pendingExpiresAt: number | null;
  lastVerifiedAt: string | null;
  recoveryCodesCreatedAt: string | null;
}

export interface TwoFactorEnrollment {
  status: 'pending' | 'active' | 'disabled';
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
  recoveryCodes: string[];
  expiresAt: number;
}

export interface TwoFactorRecoveryCodes {
  recoveryCodes: string[];
}

export async function getTwoFactorStatus(): Promise<TwoFactorStatus> {
  return apiFetch<TwoFactorStatus>('/auth/2fa/status');
}

export async function startTwoFactorEnrollment(): Promise<TwoFactorEnrollment> {
  return apiFetch<TwoFactorEnrollment>('/auth/2fa/enroll/start', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function confirmTwoFactorEnrollment(code: string): Promise<TwoFactorStatus> {
  return apiFetch<TwoFactorStatus>('/auth/2fa/enroll/confirm', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function cancelTwoFactorEnrollment(): Promise<TwoFactorStatus> {
  return apiFetch<TwoFactorStatus>('/auth/2fa/enroll/cancel', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function disableTwoFactor(code?: string): Promise<TwoFactorStatus> {
  return apiFetch<TwoFactorStatus>('/auth/2fa/disable', {
    method: 'POST',
    body: JSON.stringify(code ? { code } : {}),
  });
}

export async function regenerateTwoFactorRecoveryCodes(code: string): Promise<TwoFactorRecoveryCodes> {
  return apiFetch<TwoFactorRecoveryCodes>('/auth/2fa/recovery/regenerate', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

// ============================================================================
// Tournament Ladder API
// ============================================================================

export interface LadderPlayerSummary {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  rating: number;
  rank: number;
  streak: number;
}

export interface LadderQueueEntry {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  position: number;
  joinedAt: string;
  isYou: boolean;
}

export interface LadderMatchParticipant {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  rating: number;
  role: 'champion' | 'challenger';
}

export interface LadderCurrentMatch {
  matchId: string;
  status: 'waiting' | 'countdown' | 'playing';
  startedAt: string;
  champion: LadderMatchParticipant;
  challenger: LadderMatchParticipant;
}

export interface LadderOverview {
  leaderboard: LadderPlayerSummary[];
  you?: {
    rating: number;
    rank: number | null;
    streak: number;
  };
  queue: {
    inQueue: boolean;
    position: number | null;
    estimatedWaitSeconds: number | null;
  };
  queueLineup: LadderQueueEntry[];
  currentMatch: LadderCurrentMatch | null;
  recentMatches: Array<{
    matchId: string;
    opponentDisplayName: string;
    opponentRating: number;
    result: 'win' | 'loss';
    score: string;
    playedAt: string;
  }>;
}

export interface LadderQueueState {
  inQueue: boolean;
  position: number | null;
  estimatedWaitSeconds: number | null;
  matchmakingMessage: string;
}

export async function getLadderOverview(): Promise<LadderOverview> {
  return apiFetch<LadderOverview>('/ladder/overview');
}

export async function joinLadderQueue(): Promise<LadderQueueState> {
  return apiFetch<LadderQueueState>('/ladder/queue/join', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function leaveLadderQueue(): Promise<LadderQueueState> {
  return apiFetch<LadderQueueState>('/ladder/queue/leave', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export interface ArenaMatchRecord {
  matchId: string;
  id: string;
  p1Id: string;
  p2Id: string;
  state: string;
  p1Score: number;
  p2Score: number;
  winnerId: string | null;
  pausedBy: string | null;
  createdAt?: string;
  startedAt?: string | null;
  endedAt?: string | null;
}

export async function getArenaMatchRecord(matchId: string): Promise<ArenaMatchRecord> {
  const raw = await apiFetch<{
    matchId: string;
    id: string;
    p1Id: string;
    p2Id: string;
    p1Score: number;
    p2Score: number;
    state: string;
    winnerId: string | null;
    pausedBy: string | null;
    createdAt?: string;
    startedAt?: string | null;
    endedAt?: string | null;
  }>(`/matches/pong/${matchId}`);

  return {
    matchId: raw.matchId ?? raw.id,
    id: raw.id,
    p1Id: raw.p1Id,
    p2Id: raw.p2Id,
    p1Score: raw.p1Score,
    p2Score: raw.p2Score,
    state: raw.state,
    winnerId: raw.winnerId,
    pausedBy: raw.pausedBy ?? null,
    createdAt: raw.createdAt,
    startedAt: raw.startedAt ?? null,
    endedAt: raw.endedAt ?? null,
  };
}

// ============================================================================
// Match API (already exists in play.ts, but centralizing here)
// ============================================================================

export interface MatchData {
  matchId: string;
  p1Id: string;
  p2Id: string;
  state: string;
  p1Score: number;
  p2Score: number;
  winnerId: string | null;
  pausedBy: string | null;
  createdAt?: string;
  startedAt?: string | null;
  endedAt?: string | null;
}

/**
 * Create a new standalone Pong match
 */
export async function createMatch(opponentId: string): Promise<MatchData> {
  const raw = await apiFetch<{
    matchId: string;
    p1Id: string;
    p2Id: string;
    state: string;
  }>('/matches/pong', {
    method: 'POST',
    body: JSON.stringify({ opponentId }),
  });

  return {
    matchId: raw.matchId,
    p1Id: raw.p1Id,
    p2Id: raw.p2Id,
    state: raw.state,
    p1Score: 0,
    p2Score: 0,
    winnerId: null,
    pausedBy: null,
  };
}

/**
 * Get match details
 */
export async function getMatch(matchId: string): Promise<MatchData> {
  const raw = await apiFetch<{
    matchId?: string;
    id: string;
    p1Id: string;
    p2Id: string;
    p1Score: number;
    p2Score: number;
    state: string;
    winnerId: string | null;
    pausedBy: string | null;
    createdAt?: string;
    startedAt?: string | null;
    endedAt?: string | null;
  }>(`/matches/pong/${matchId}`);

  return {
    matchId: raw.matchId ?? raw.id,
    p1Id: raw.p1Id,
    p2Id: raw.p2Id,
    state: raw.state,
    p1Score: raw.p1Score,
    p2Score: raw.p2Score,
    winnerId: raw.winnerId,
    pausedBy: raw.pausedBy,
    createdAt: raw.createdAt,
    startedAt: raw.startedAt,
    endedAt: raw.endedAt,
  };
}

/**
 * Record final match result
 */
export async function updateMatchResult(matchId: string, payload: { winnerId: string; p1Score: number; p2Score: number }): Promise<void> {
  await apiFetch<void>(`/matches/pong/${matchId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/**
 * Get match chat history
 */
export async function getMatchChat(matchId: string): Promise<ChatMessage[]> {
  return apiFetch<ChatMessage[]>(`/matches/pong/${matchId}/chat`);
}

export interface PracticeMatchPayload {
  playerScore: number;
  botScore: number;
  result: 'win' | 'loss';
}

export interface PracticeMatchResponse {
  ok: boolean;
  matchId: string;
}

export async function recordPracticeMatch(payload: PracticeMatchPayload): Promise<PracticeMatchResponse> {
  return apiFetch<PracticeMatchResponse>(`/matches/pong/practice`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
