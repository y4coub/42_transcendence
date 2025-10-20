import type { ChatChannel, OnlinePlayer } from "../../lib/api-client";

export type ChatMode = "channel" | "dm";

export interface DisplayMessage {
  id: string;
  userId: string;
  displayName: string;
  content: string;
  timestamp: string;
  avatarUrl: string | null;
}

export interface BlockedUserEntry {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  blockedAt: string;
}

export interface ConversationPreview {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  status: "online" | "offline" | "in-game";
}

export interface ChatCallbacks {
  channelsUpdate: (() => void) | null;
  messagesUpdate: (() => void) | null;
  dmsUpdate: (() => void) | null;
  blockedListUpdate: (() => void) | null;
  onlineUsersUpdate: (() => void) | null;
}

export interface ChatState {
  channels: ChatChannel[];
  currentChannel: string | null;
  currentDMUserId: string | null;
  chatMode: ChatMode;
  messages: DisplayMessage[];
  blockedUsers: Set<string>;
  blockedEntries: BlockedUserEntry[];
  dmConversations: ConversationPreview[];
  onlinePlayers: OnlinePlayer[];
  isLoading: {
    channels: boolean;
    messages: boolean;
    dms: boolean;
    blocked: boolean;
    onlineUsers: boolean;
  };
  isCreatingChannel: boolean;
  onlineRefreshInterval: number | null;
  onlineRefreshListenerRegistered: boolean;
  callbacks: ChatCallbacks;
}

export const createInitialChatState = (): ChatState => ({
  channels: [],
  currentChannel: null,
  currentDMUserId: null,
  chatMode: "channel",
  messages: [],
  blockedUsers: new Set<string>(),
  blockedEntries: [],
  dmConversations: [],
  onlinePlayers: [],
  isLoading: {
    channels: false,
    messages: false,
    dms: false,
    blocked: false,
    onlineUsers: false,
  },
  isCreatingChannel: false,
  onlineRefreshInterval: null,
  onlineRefreshListenerRegistered: false,
  callbacks: {
    channelsUpdate: null,
    messagesUpdate: null,
    dmsUpdate: null,
    blockedListUpdate: null,
    onlineUsersUpdate: null,
  },
});
