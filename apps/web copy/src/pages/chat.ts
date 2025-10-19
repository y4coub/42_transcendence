import {
  createDiv,
  createElement,
  createButton,
  createInput,
  appendChildren,
} from "../utils/dom";
import { createIcon } from "../utils/icons";
import { getAccessToken, getUserId } from "../lib/auth";
import { chatWS, type ChatMessage as WSChatMessage } from "../lib/chat-ws";
import {
  getChannels,
  createChannel,
  deleteChannel,
  joinChannel,
  getChannelHistory,
  sendChannelMessage,
  getDMHistory,
  sendDM,
  blockUser,
  unblockUser,
  getConversations,
  getBlockedUsers,
  getUserProfile,
  getOnlineUsers,
  type ChatChannel,
  type ChatMessage as ApiChatMessage,
  type OnlinePlayer,
} from "../lib/api-client";
import {
  showError,
  showSuccess,
  showConfirm,
  showPrompt,
} from "../components/Modal";
import { chatState, notify } from "./chat/state";
import type {
  ChatMode,
  ConversationPreview,
  DisplayMessage,
} from "./chat/types";

const deletingChannels = new Set<string>();
const joiningChannels = new Map<string, Promise<void>>();
const userSummaryCache = new Map<string, { displayName: string; avatarUrl: string | null }>();

// Load channels from API
async function loadChannels(): Promise<void> {
  if (chatState.isLoading.channels) return;
  
  try {
    chatState.isLoading.channels = true;
    console.log('Loading channels from API...');
    chatState.channels = await getChannels();
    console.log('Loaded channels:', chatState.channels);
    
    notify.channels();
  } catch (error) {
    console.error('Failed to load channels:', error);
  } finally {
    chatState.isLoading.channels = false;
  }
}

// Load channel history from API
async function loadChannelHistory(channelSlug: string): Promise<void> {
  if (chatState.isLoading.messages) return;
  
  try {
    chatState.isLoading.messages = true;
    console.log('Loading history for channel:', channelSlug);
    const history = await getChannelHistory(channelSlug, 50);
    const normalized = await normalizeChatMessages(history);
    chatState.messages = normalized
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    console.log('Loaded messages:', chatState.messages.length);
  } catch (error) {
    console.error('Failed to load channel history:', error);
    chatState.messages = [];
  } finally {
    chatState.isLoading.messages = false;
    notify.messages();
  }
}

async function ensureChannelMembership(channelSlug: string): Promise<void> {
  const viewerId = getUserId();
  if (viewerId) {
    const existingChannel = chatState.channels.find((channel) => channel.slug === channelSlug);
    if (existingChannel && Array.isArray((existingChannel as any).members)) {
      const members = (existingChannel as any).members as Array<{ userId: string }>;
      if (members.some((member) => member.userId === viewerId)) {
        return;
      }
    }
  }

  const existing = joiningChannels.get(channelSlug);
  if (existing) {
    await existing;
    return;
  }

  const joinPromise = joinChannel(channelSlug)
    .then(() => {
      void loadChannels();
    })
    .catch((error) => {
      throw error;
    })
    .finally(() => {
      joiningChannels.delete(channelSlug);
    });

  joiningChannels.set(channelSlug, joinPromise);
  await joinPromise;
}

// Switch to a channel
async function switchChannel(channelSlug: string): Promise<void> {
  if (chatState.currentChannel === channelSlug) return;
  const previousChannel = chatState.currentChannel;
  const previousMode = chatState.chatMode;

  try {
    await ensureChannelMembership(channelSlug);
  } catch (error) {
    console.error('Failed to join channel:', error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Unable to join this channel.';
    showError('Join Failed', message);
    return;
  }

  chatState.chatMode = 'channel';
  chatState.currentChannel = channelSlug;
  chatState.currentDMUserId = null;
  chatState.messages = [];
  chatWS.joinRoom(channelSlug);
  console.log('Switching to channel:', channelSlug);
  
  // Update UI immediately
  notify.channels();
  notify.dms();
  notify.messages();
  
  // Load history
  try {
    await loadChannelHistory(channelSlug);
  } catch (error) {
    console.error('Failed to load channel after joining:', error);
    chatState.currentChannel = previousChannel;
    chatState.chatMode = previousMode;
    notify.channels();
    notify.dms();
    showError('Load Failed', 'Unable to load this channel.');
  }
}

async function trySendWithWebSocket(sendAction: () => boolean): Promise<boolean> {
  let sent = sendAction();
  if (sent) {
    return true;
  }

  const state = chatWS.getState();
  if (state === 'connecting' || state === 'closed') {
    const opened = await chatWS.waitForOpen(5000);
    if (!opened) {
      return false;
    }
    sent = sendAction();
  }

  return sent;
}

// Send a message to current channel or DM
async function sendChatMessage(content: string): Promise<void> {
  const trimmed = content.trim();
  if (!trimmed) return;

  if (chatState.chatMode === 'dm' && chatState.currentDMUserId && chatState.blockedUsers.has(chatState.currentDMUserId)) {
    showError('Blocked', 'You have blocked this user. Unblock them to resume messaging.');
    return;
  }
  
  try {
    if (chatState.chatMode === 'channel' && chatState.currentChannel) {
      await ensureChannelMembership(chatState.currentChannel);
      console.log('Sending message to channel', chatState.currentChannel, ':', content);
      const sent = await trySendWithWebSocket(() =>
        chatWS.sendChannelMessage(chatState.currentChannel ?? '', trimmed),
      );
      if (!sent) {
        console.warn('WebSocket unavailable, falling back to REST send for channel message');
        await sendChannelMessage(chatState.currentChannel, trimmed);
        await loadChannelHistory(chatState.currentChannel);
      }
    } else if (chatState.chatMode === 'dm' && chatState.currentDMUserId) {
      console.log('Sending DM to', chatState.currentDMUserId, ':', content);
      const sent = await trySendWithWebSocket(() =>
        chatWS.sendDirectMessage(chatState.currentDMUserId ?? '', trimmed),
      );
      if (!sent) {
        console.warn('WebSocket unavailable, falling back to REST send for DM');
        await sendDM(chatState.currentDMUserId, trimmed);
        await loadDMHistoryMessages(chatState.currentDMUserId);
        await loadDMConversations();
      }
    }
  } catch (error) {
    console.error('Failed to send message:', error);
    const details =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : 'Failed to send message. Please try again.';
    showError('Send Failed', details);
  }
}

async function resolveUserSummary(userId: string): Promise<{ displayName: string; avatarUrl: string | null }> {
  const cached = userSummaryCache.get(userId);
  if (cached) {
    return cached;
  }

  try {
    const profile = await getUserProfile(userId);
    const summary = {
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl ?? null,
    };
    userSummaryCache.set(userId, summary);
    return summary;
  } catch (error) {
    console.warn('Failed to load user profile for conversation summary:', error);
    const fallback = {
      displayName: getFallbackDisplayName(userId),
      avatarUrl: null,
    };
    userSummaryCache.set(userId, fallback);
    return fallback;
  }
}

function getFallbackDisplayName(userId: string): string {
  return `Player ${userId.slice(0, 6)}`;
}

async function normalizeChatMessages(rawMessages: readonly ApiChatMessage[] | null | undefined): Promise<DisplayMessage[]> {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return [];
  }

  const messageList = [...rawMessages];
  const uniqueUserIds = Array.from(new Set(messageList.map((message) => message.senderId)));
  await Promise.all(uniqueUserIds.map((userId) => resolveUserSummary(userId)));

  return messageList.map((message) => {
    const summary = userSummaryCache.get(message.senderId);
    const displayName = summary?.displayName ?? getFallbackDisplayName(message.senderId);

    if (!summary) {
      userSummaryCache.set(message.senderId, {
        displayName,
        avatarUrl: null,
      });
    }

    return {
      id: message.id,
      userId: message.senderId,
      displayName,
      content: message.content,
      timestamp: message.createdAt,
    } satisfies DisplayMessage;
  });
}

async function loadBlockedUsers(): Promise<void> {
  try {
    chatState.isLoading.blocked = true;
    notify.blocked();

    const blocked = await getBlockedUsers();
    const validEntries = blocked
      .map((entry) => entry?.blockedId ? { userId: entry.blockedId, createdAt: entry.createdAt ?? new Date().toISOString() } : null)
      .filter((entry): entry is { userId: string; createdAt: string } => entry !== null);

    chatState.blockedUsers = new Set(validEntries.map((entry) => entry.userId));

    const resolved = await Promise.all(
      validEntries.map(async (entry) => {
        const summary = await resolveUserSummary(entry.userId);
        return {
          userId: entry.userId,
          displayName: summary.displayName,
          avatarUrl: summary.avatarUrl,
          blockedAt: entry.createdAt,
        };
      })
    );

    resolved.sort((a, b) => new Date(b.blockedAt).getTime() - new Date(a.blockedAt).getTime());
    chatState.blockedEntries = resolved;

    notify.dms();
    notify.onlineUsers();
    notify.blocked();
  } catch (error) {
    console.error('Failed to load blocked users:', error);
    chatState.blockedEntries = [];
  }
  finally {
    chatState.isLoading.blocked = false;
    notify.blocked();
  }
}

function getChannelLabel(channel: ChatChannel): string {
  const label = channel.title ?? channel.name ?? channel.slug;
  const trimmed = typeof label === 'string' ? label.trim() : '';
  return trimmed.length > 0 ? trimmed : channel.slug;
}

async function loadOnlinePlayers(): Promise<void> {
  if (chatState.isLoading.onlineUsers) {
    return;
  }

  chatState.isLoading.onlineUsers = true;
  notify.onlineUsers();

  try {
    const response = await getOnlineUsers();
    chatState.onlinePlayers = Array.isArray(response.players) ? response.players : [];

    chatState.onlinePlayers.forEach((player) => {
      userSummaryCache.set(player.userId, {
        displayName: player.displayName,
        avatarUrl: player.avatarUrl,
      });
    });

    const onlineMap = new Map<string, OnlinePlayer>();
    chatState.onlinePlayers.forEach((player) => {
      onlineMap.set(player.userId, player);
    });

    let didChange = false;

    chatState.dmConversations = chatState.dmConversations.map((conversation) => {
      const match = onlineMap.get(conversation.userId);
      if (!match) {
        if (conversation.status !== 'offline') {
          didChange = true;
          return { ...conversation, status: 'offline' };
        }
        return conversation;
      }

      const updated: ConversationPreview = {
        ...conversation,
        status: match.status,
        avatarUrl: match.avatarUrl ?? conversation.avatarUrl,
      };

      if (
        updated.status !== conversation.status ||
        updated.avatarUrl !== conversation.avatarUrl
      ) {
        didChange = true;
      }

      return updated;
    });

    if (didChange) {
    notify.dms();
  }
  } catch (error) {
    console.error('Failed to load online users:', error);
  } finally {
    chatState.isLoading.onlineUsers = false;
    notify.onlineUsers();
  }
}

async function loadDMConversations(limit: number = 20): Promise<void> {
  if (chatState.isLoading.dms) {
    return;
  }

  chatState.isLoading.dms = true;

  try {
    const raw = (await getConversations(limit)) as Array<Record<string, any>>;

    const resolved = await Promise.all(
      raw.map(async (conversation) => {
        const summary = await resolveUserSummary(String(conversation.otherId));
        const displayName =
          typeof conversation.otherDisplayName === 'string'
            ? conversation.otherDisplayName
            : typeof conversation.displayName === 'string'
            ? conversation.displayName
            : summary.displayName;

        const avatarUrl =
          typeof conversation.otherAvatarUrl === 'string'
            ? conversation.otherAvatarUrl
            : conversation.otherAvatarUrl === null
            ? null
            : typeof conversation.avatarUrl === 'string'
            ? conversation.avatarUrl
            : summary.avatarUrl;

        const preview =
          typeof conversation.lastMessagePreview === 'string'
            ? conversation.lastMessagePreview
            : typeof conversation.lastMessage === 'string'
            ? conversation.lastMessage
            : null;

        const statusRaw = String(conversation.status ?? 'offline');
        const status: ConversationPreview['status'] =
          statusRaw === 'online' || statusRaw === 'in-game' ? (statusRaw as ConversationPreview['status']) : 'offline';

        const unread = Number(conversation.unreadCount ?? 0);
        const lastMessageAt = typeof conversation.lastMessageAt === 'string' ? conversation.lastMessageAt : null;

        const entry: ConversationPreview = {
          userId: String(conversation.otherId),
          displayName,
          avatarUrl,
          lastMessageAt,
          lastMessagePreview: preview,
          unreadCount: Number.isFinite(unread) ? unread : 0,
          status,
        };

        return entry;
      })
    );

    resolved.sort((a, b) => {
      const aTs = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTs = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTs - aTs;
    });

    chatState.dmConversations = resolved;
  } catch (error) {
    console.error('Failed to load DM conversations:', error);
    // Keep existing conversations on failure to avoid clearing the UI
  } finally {
    chatState.isLoading.dms = false;
    notify.dms();
  }
}

function upsertConversationPreviewEntry(
  userId: string,
  patch: {
    displayName?: string;
    avatarUrl?: string | null;
    status?: ConversationPreview['status'];
    lastMessageAt?: string | null;
    lastMessagePreview?: string | null;
    unreadCount?: number;
    incrementUnread?: boolean;
    resetUnread?: boolean;
  } = {}
): void {
  const existing = chatState.dmConversations.find((dm) => dm.userId === userId) ?? null;
  const effectiveLastMessageAt =
    patch.lastMessageAt ??
    existing?.lastMessageAt ??
    (patch.lastMessagePreview ? new Date().toISOString() : null);

  const shouldResetUnread =
    patch.resetUnread || (chatState.chatMode === 'dm' && chatState.currentDMUserId === userId);

  let unread = existing?.unreadCount ?? 0;
  if (typeof patch.unreadCount === 'number') {
    unread = patch.unreadCount;
  } else if (patch.incrementUnread) {
    unread = unread + 1;
  }
  if (shouldResetUnread) {
    unread = 0;
  }

  const updated: ConversationPreview = {
    userId,
    displayName: patch.displayName ?? existing?.displayName ?? getFallbackDisplayName(userId),
    avatarUrl: patch.avatarUrl !== undefined ? patch.avatarUrl : existing?.avatarUrl ?? null,
    lastMessageAt: effectiveLastMessageAt,
    lastMessagePreview:
      patch.lastMessagePreview !== undefined ? patch.lastMessagePreview : existing?.lastMessagePreview ?? null,
    unreadCount: unread,
    status: patch.status ?? existing?.status ?? 'offline',
  };

  const others = chatState.dmConversations.filter((dm) => dm.userId !== userId);
  const nextList = [updated, ...others];
  nextList.sort((a, b) => {
    const aTs = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bTs = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return bTs - aTs;
  });

  const didChange =
    !existing ||
    existing.displayName !== updated.displayName ||
    existing.avatarUrl !== updated.avatarUrl ||
    existing.lastMessageAt !== updated.lastMessageAt ||
    existing.lastMessagePreview !== updated.lastMessagePreview ||
    existing.unreadCount !== updated.unreadCount ||
    existing.status !== updated.status ||
    chatState.dmConversations.length !== nextList.length;

  if (!didChange) {
    return;
  }

  chatState.dmConversations = nextList;
  notify.dms();
}

// Switch to DM with a user
async function switchToDM(
  userId: string,
  displayName: string,
  options?: {
    avatarUrl?: string | null;
    status?: ConversationPreview['status'];
    lastMessagePreview?: string | null;
  }
): Promise<void> {
  const existing = chatState.dmConversations.find((dm) => dm.userId === userId) ?? null;

  if (!existing) {
    const entry: ConversationPreview = {
      userId,
      displayName,
      avatarUrl: options?.avatarUrl ?? null,
      lastMessageAt: null,
      lastMessagePreview: options?.lastMessagePreview ?? null,
      unreadCount: 0,
      status: options?.status ?? 'online',
    };

    chatState.dmConversations = [entry, ...chatState.dmConversations.filter((dm) => dm.userId !== userId)];
    notify.dms();
  } else {
    let updated = false;

    if (options && 'avatarUrl' in options && existing.avatarUrl !== options.avatarUrl) {
      existing.avatarUrl = options.avatarUrl ?? null;
      updated = true;
    }

    if (options && options.status && existing.status !== options.status) {
      existing.status = options.status;
      updated = true;
    }

    if (
      options &&
      options.lastMessagePreview !== undefined &&
      existing.lastMessagePreview !== options.lastMessagePreview
    ) {
      existing.lastMessagePreview = options.lastMessagePreview;
      updated = true;
    }

    if (updated && chatState.callbacks.dmsUpdate) {
      chatState.callbacks.dmsUpdate();
    }
  }

  chatState.chatMode = 'dm';
  chatState.currentDMUserId = userId;
  chatState.currentChannel = null;
  chatState.messages = [];
  
  console.log('Switching to DM with:', userId, displayName);
  
  // Update UI
  notify.channels();
  notify.dms();
  notify.messages();
  
  // Load DM history
  await loadDMHistoryMessages(userId);
}

// Load DM history messages
async function loadDMHistoryMessages(userId: string): Promise<void> {
  if (chatState.isLoading.messages) return;
  
  try {
    chatState.isLoading.messages = true;
    console.log('Loading DM history with:', userId);
    const history = await getDMHistory(userId, 50);
    const normalized = await normalizeChatMessages(history);
    chatState.messages = normalized
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    console.log('Loaded DM messages:', chatState.messages.length);
  } catch (error) {
    console.error('Failed to load DM history:', error);
    chatState.messages = [];
  } finally {
    chatState.isLoading.messages = false;
    notify.messages();
  }
}

// Block a user
async function handleBlockUser(userId: string, displayName: string): Promise<void> {
  showConfirm(
    'Block User',
    `Are you sure you want to block ${displayName}? You won't be able to send or receive messages from them.`,
    async () => {
      try {
        await blockUser(userId);
        chatState.blockedUsers.add(userId);
        await loadBlockedUsers();
        await loadDMConversations();
        showSuccess('User Blocked', `${displayName} has been blocked.`);
      
        // If currently viewing this DM, switch away
        if (chatState.currentDMUserId === userId) {
          chatState.chatMode = 'channel';
          chatState.currentDMUserId = null;
          if (chatState.channels.length > 0) {
            await switchChannel(chatState.channels[0].slug);
          }
        }
        notify.messages();
      } catch (error) {
        console.error('Failed to block user:', error);
        showError('Block Failed', 'Failed to block user. Please try again.');
      }
    }
  );
}

// Unblock a user
async function handleUnblockUser(userId: string, displayName: string): Promise<void> {
  try {
    await unblockUser(userId);
    chatState.blockedUsers.delete(userId);
    await loadBlockedUsers();
    await loadDMConversations();
    showSuccess('User Unblocked', `${displayName} has been unblocked.`);

    notify.messages();
  } catch (error) {
    console.error('Failed to unblock user:', error);
    showError('Unblock Failed', 'Failed to unblock user. Please try again.');
  }
}

async function handleDeleteChannel(channel: ChatChannel): Promise<void> {
  const slug = channel.slug;
  if (!slug || deletingChannels.has(slug)) {
    return;
  }

  deletingChannels.add(slug);
  const label = getChannelLabel(channel);

  try {
    await deleteChannel(slug);

    chatState.channels = chatState.channels.filter((c) => c.slug !== slug);

    const wasActive = chatState.chatMode === 'channel' && chatState.currentChannel === slug;
    if (wasActive) {
      chatState.currentChannel = null;
      chatState.messages = [];
    }

    notify.channels();

    if (wasActive) {
      if (chatState.channels.length > 0) {
        await switchChannel(chatState.channels[0].slug);
      } else {
        notify.messages();
      }
    }

    showSuccess('Channel Deleted', `#${label} has been deleted.`);

    void loadChannels();
  } catch (error) {
    console.error('Failed to delete channel:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to delete channel. Please try again.';
    showError('Delete Failed', message);
  } finally {
    deletingChannels.delete(slug);
  }
}

// Initialize WebSocket connection
function initializeWebSocket(): void {
  const token = getAccessToken();
  if (!token) {
    console.error('No auth token found, cannot connect to WebSocket');
    return;
  }
  
  console.log('Connecting to chat WebSocket...');
  chatWS.connect(token);
  chatWS.onOpen(() => {
    if (chatState.currentChannel) {
      chatWS.joinRoom(chatState.currentChannel);
    }
  });
  if (chatState.currentChannel) {
    chatWS.joinRoom(chatState.currentChannel);
  }
  
  // Subscribe to incoming messages
  chatWS.subscribe((message: WSChatMessage) => {
    const viewerId = getUserId();
    if (message.type === 'channel' && message.room === chatState.currentChannel) {
      console.log('Received channel message:', message);
      
      // Add message to messages array
      if (message.from && message.content) {
        const senderId = message.from;
        if (message.displayName) {
          userSummaryCache.set(senderId, {
            displayName: message.displayName,
            avatarUrl: userSummaryCache.get(senderId)?.avatarUrl ?? null,
          });
        }

        const summary = userSummaryCache.get(senderId);
        const newMessage: DisplayMessage = {
          id: `${Date.now()}`,
          userId: senderId,
          displayName: message.displayName || summary?.displayName || getFallbackDisplayName(senderId),
          content: message.content,
          timestamp: message.timestamp || new Date().toISOString(),
        };
        
        chatState.messages.push(newMessage);
        
        // Update UI
        notify.messages();
      }
    } else if (message.type === 'dm') {
      const partnerId =
        message.from && message.from !== viewerId
          ? message.from
          : message.userId && message.userId !== viewerId
          ? message.userId
          : message.from ?? message.userId ?? null;

      if (!partnerId) {
        return;
      }

      const senderId = message.from ?? partnerId;
      const isActiveDm = chatState.chatMode === 'dm' && chatState.currentDMUserId === partnerId;
      const timestamp = message.timestamp || new Date().toISOString();
      const content = message.content ?? '';

      if (content && isActiveDm) {
        if (message.displayName) {
          userSummaryCache.set(senderId, {
            displayName: message.displayName,
            avatarUrl: userSummaryCache.get(senderId)?.avatarUrl ?? null,
          });
        }

        const summary = userSummaryCache.get(senderId);
        const dmMessage: DisplayMessage = {
          id: `${Date.now()}`,
          userId: senderId,
          displayName:
            message.displayName ||
            summary?.displayName ||
            getFallbackDisplayName(senderId),
          content,
          timestamp,
        };

        chatState.messages.push(dmMessage);
        notify.messages();
      }

      let partnerSummary = userSummaryCache.get(partnerId);
      if (message.displayName) {
        const summary = {
          displayName: message.displayName,
          avatarUrl: partnerSummary?.avatarUrl ?? null,
        };
        userSummaryCache.set(partnerId, summary);
        partnerSummary = summary;
      }
      const conversationDisplayName =
        message.displayName ||
        partnerSummary?.displayName ||
        getFallbackDisplayName(partnerId);

      upsertConversationPreviewEntry(partnerId, {
        displayName: conversationDisplayName,
        avatarUrl: partnerSummary?.avatarUrl ?? null,
        lastMessagePreview: content || null,
        lastMessageAt: timestamp,
        incrementUnread: viewerId !== null && senderId !== viewerId && !isActiveDm,
        resetUnread: isActiveDm,
      });

      if (!partnerSummary) {
        void resolveUserSummary(partnerId).then((resolved) => {
          upsertConversationPreviewEntry(partnerId, {
            displayName: resolved.displayName,
            avatarUrl: resolved.avatarUrl,
          });
        });
      }
    } else if (message.type === 'error') {
      console.error('Chat WebSocket error:', message.error);
    }
  });
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
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = initials;
    img.className = 'w-full h-full object-cover';
    img.onerror = () => {
      img.remove();
      const fallback = createElement("span", "text-[#00C8FF]");
      fallback.textContent = initials;
      avatar.appendChild(fallback);
    };
    avatar.appendChild(img);
    return avatar;
  }

  const text = createElement("span", "text-[#00C8FF]");
  text.textContent = initials;
  avatar.appendChild(text);
  return avatar;
}

function createBadge(count: number): HTMLElement {
  const badge = createDiv(
    "bg-[#FF008C] text-white h-5 w-5 flex items-center justify-center rounded-full text-xs"
  );
  badge.textContent = count.toString();
  return badge;
}

export function createChatPage(): HTMLElement {
  const container = createDiv("min-h-screen w-full bg-[#121217] pt-24 pb-12");
  const innerContainer = createDiv("max-w-6xl mx-auto px-4");
  const grid = createDiv("grid gap-6 lg:grid-cols-12");

  let searchFilter = "";

  const sidebarColumn = createDiv("lg:col-span-4");
  const sidebarCard = createDiv("border border-[#00C8FF]/30 bg-[#1a1a24] rounded p-4 space-y-6 h-full");

  const searchWrapper = createDiv("relative");
  const searchInput = createInput(
    "text",
    "w-full pl-10 pr-3 py-2 rounded border border-[#00C8FF]/30 bg-[#121217] text-[#E0E0E0] focus:border-[#00C8FF] focus:outline-none",
    "Search channels or players"
  );
  const searchIcon = createIcon(
    "search",
    "h-4 w-4 text-[#E0E0E0]/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
  );
  searchWrapper.appendChild(searchIcon);
  searchWrapper.appendChild(searchInput);

  const channelsSection = createDiv("space-y-2");
  const channelsHeader = createDiv("flex items-center justify-between gap-2");
  const channelsTitle = createElement("h3", "text-xs font-semibold tracking-wide uppercase text-[#E0E0E0]/50");
  channelsTitle.textContent = "Channels";
  const createChannelBtn = createButton(
    "New Channel",
    "text-xs px-3 py-1 rounded border border-[#00C8FF]/40 text-[#00C8FF] hover:border-[#00C8FF] transition-colors"
  );
  appendChildren(channelsHeader, [channelsTitle, createChannelBtn]);
  const channelsList = createDiv("space-y-1");

  const onlineSection = createDiv("space-y-2");
  const onlineHeader = createDiv("flex items-center justify-between gap-2");
  const onlineTitle = createElement("h3", "text-xs font-semibold tracking-wide uppercase text-[#E0E0E0]/50");
  onlineTitle.textContent = "Online Players";
  const refreshOnlineBtn = createButton(
    "Refresh",
    "text-xs px-3 py-1 rounded border border-[#00C8FF]/40 text-[#00C8FF] hover:border-[#00C8FF] transition-colors"
  );
  appendChildren(onlineHeader, [onlineTitle, refreshOnlineBtn]);
  const onlineList = createDiv("space-y-2");
  appendChildren(onlineSection, [onlineHeader, onlineList]);

  const dmsSection = createDiv("space-y-2");
  const dmsTitle = createElement("h3", "text-xs font-semibold tracking-wide uppercase text-[#E0E0E0]/50");
  dmsTitle.textContent = "Direct Messages";
  const dmsList = createDiv("space-y-2");
  const dmsHint = createElement("p", "text-xs text-[#E0E0E0]/40");
  dmsHint.textContent = "Tip: Right-click a conversation to block or unblock a player.";

  const blockedSection = createDiv("space-y-2");
  const blockedTitle = createElement("h3", "text-xs font-semibold tracking-wide uppercase text-[#E0E0E0]/50");
  blockedTitle.textContent = "Blocked Players";
  const blockedList = createDiv("space-y-2");
  const blockedHint = createElement("p", "text-xs text-[#E0E0E0]/40");
  blockedHint.textContent = "Players you block cannot DM you.";

  appendChildren(channelsSection, [channelsHeader, channelsList]);
  appendChildren(dmsSection, [dmsTitle, dmsList, dmsHint]);
  appendChildren(blockedSection, [blockedTitle, blockedList, blockedHint]);
  appendChildren(sidebarCard, [searchWrapper, onlineSection, channelsSection, dmsSection, blockedSection]);
  sidebarColumn.appendChild(sidebarCard);

  const mainColumn = createDiv("lg:col-span-8");
  const chatCard = createDiv("border border-[#00C8FF]/30 bg-[#1a1a24] rounded h-[calc(100vh-12rem)] min-h-[540px] flex flex-col");
  const chatHeader = createDiv("flex items-center justify-between px-5 py-4 border-b border-[#00C8FF]/30");
  const headerLeft = createDiv("flex items-center gap-3");
  const headerIconSlot = createDiv("h-8 w-8 flex items-center justify-center rounded border border-[#00C8FF]/40 bg-[#00C8FF]/10");
  const headerInfo = createDiv();
  const headerTitle = createElement("h3", "text-lg font-semibold text-[#E0E0E0]");
  headerTitle.textContent = "Select a conversation";
  const headerSubtitle = createElement("p", "text-sm text-[#E0E0E0]/60");
  headerSubtitle.textContent = "Choose a channel or direct message to begin.";
  appendChildren(headerInfo, [headerTitle, headerSubtitle]);
  appendChildren(headerLeft, [headerIconSlot, headerInfo]);

  const headerRight = createDiv("flex items-center gap-2");
  const blockBtn = createButton(
    "",
    "px-3 py-2 flex gap-2 rounded border border-[#FF008C]/40 text-[#FF008C] hover:border-[#FF008C] transition-colors hidden"
  );
  headerRight.appendChild(blockBtn);
  appendChildren(chatHeader, [headerLeft, headerRight]);

  const messagesArea = createDiv("flex-1 px-5 py-4 overflow-y-auto space-y-4");

  const composer = createDiv("px-5 py-4 border-t border-[#00C8FF]/30");
  const composerStack = createDiv("space-y-2");
  const inputRow = createDiv("flex gap-2");
  const messageInput = createInput(
    "text",
    "flex-1 px-3 py-2 rounded border border-[#00C8FF]/50 bg-[#121217] text-[#E0E0E0] focus:border-[#00C8FF] focus:outline-none",
    "Select a conversation to start chatting"
  );
  const sendBtn = createButton(
    "Send",
    "px-4 py-2rounded bg-[#00C8FF] text-[#121217] hover:bg-[#00C8FF]/90 transition-colors flex items-center gap-2 disabled:opacity-50"
  );
  sendBtn.insertBefore(createIcon("send", "h-4 w-4"), sendBtn.firstChild);
  appendChildren(inputRow, [messageInput, sendBtn]);
  const composerHint = createElement("p", "text-xs text-[#E0E0E0]/50");
  composerHint.textContent = "Messages support plain text only.";
  appendChildren(composerStack, [inputRow, composerHint]);
  composer.appendChild(composerStack);

  appendChildren(chatCard, [chatHeader, messagesArea, composer]);
  mainColumn.appendChild(chatCard);

  appendChildren(grid, [sidebarColumn, mainColumn]);
  innerContainer.appendChild(grid);
  container.appendChild(innerContainer);

  searchInput.addEventListener("input", (event) => {
    const value = (event.currentTarget as HTMLInputElement).value.trim().toLowerCase();
    searchFilter = value;
    renderChannels();
    renderDMs();
    renderBlockedUsers();
    renderOnlinePlayers();
  });

  createChannelBtn.addEventListener("click", () => {
    openCreateChannelDialog();
  });

  refreshOnlineBtn.addEventListener("click", () => {
    refreshOnlineBtn.disabled = true;
    void loadOnlinePlayers()
      .catch((error) => {
        console.error("Failed to refresh online users:", error);
      })
      .finally(() => {
        refreshOnlineBtn.disabled = false;
      });
  });

  blockBtn.addEventListener("click", () => {
    const conversation = getActiveConversation();
    if (!conversation) {
      return;
    }
    if (chatState.blockedUsers.has(conversation.userId)) {
      void handleUnblockUser(conversation.userId, conversation.displayName);
    } else {
      void handleBlockUser(conversation.userId, conversation.displayName);
    }
  });

  sendBtn.addEventListener("click", () => sendMessage());
  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  function formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return "Unknown";
    }
    const diff = Date.now() - date.getTime();
    if (diff < 60_000) return "Just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) {
      return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function getActiveChannel(): ChatChannel | null {
    if (!chatState.currentChannel) return null;
    return chatState.channels.find((channel) => channel.slug === chatState.currentChannel) ?? null;
  }

  function getActiveConversation(): ConversationPreview | null {
    if (!chatState.currentDMUserId) return null;
    return chatState.dmConversations.find((dm) => dm.userId === chatState.currentDMUserId) ?? null;
  }

  function setHeaderIcon(mode: ChatMode): void {
    headerIconSlot.innerHTML = "";
    const icon = createIcon(mode === "channel" ? "hash" : "user", "h-5 w-5 text-[#00C8FF]");
    headerIconSlot.appendChild(icon);
  }

  function updateBlockButton(conversation: ConversationPreview | null): void {
    if (!conversation) {
      blockBtn.classList.add("hidden");
      blockBtn.innerHTML = "";
      return;
    }

    blockBtn.classList.remove("hidden");
    blockBtn.innerHTML = "";

    const blocked = chatState.blockedUsers.has(conversation.userId);
    const icon = createIcon(blocked ? "shield" : "lock", "h-4 w-4");
    const label = createElement("span", "text-sm");
    label.textContent = blocked ? "Unblock Player" : "Block Player";
    appendChildren(blockBtn, [icon, label]);
  }

  function updateHeader(): void {
    if (chatState.chatMode === "channel") {
      setHeaderIcon("channel");
      const activeChannel = getActiveChannel();
      if (activeChannel) {
        headerTitle.textContent = `#${getChannelLabel(activeChannel)}`;
        if (typeof activeChannel.memberCount === "number") {
          const count = activeChannel.memberCount;
          headerSubtitle.textContent = `${count} member${count === 1 ? "" : "s"} in this channel.`;
        } else if (activeChannel.description) {
          headerSubtitle.textContent = activeChannel.description;
        } else {
          headerSubtitle.textContent = "Channel ready for messages.";
        }
      } else {
        headerTitle.textContent = "Select a channel";
        headerSubtitle.textContent = "Choose a channel to start chatting.";
      }
      updateBlockButton(null);
    } else {
      setHeaderIcon("dm");
      const conversation = getActiveConversation();
      if (!conversation) {
        headerTitle.textContent = "Select a conversation";
        headerSubtitle.textContent = "Pick a direct message to begin.";
        updateBlockButton(null);
        return;
      }
      headerTitle.textContent = conversation.displayName;
      headerSubtitle.textContent = conversation.lastMessageAt
        ? `Last message ${formatTime(conversation.lastMessageAt)}`
        : "Start a new conversation.";
      updateBlockButton(conversation);
    }
  }

  function updateComposerState(): void {
    const activeChannel = getActiveChannel();
    const conversation = getActiveConversation();
    const blocked = conversation ? chatState.blockedUsers.has(conversation.userId) : false;

    if (chatState.chatMode === "channel") {
      if (activeChannel) {
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.placeholder = `Message #${activeChannel.slug}`;
        if (typeof activeChannel.memberCount === "number" && activeChannel.memberCount >= 0) {
          const count = activeChannel.memberCount;
          composerHint.textContent = `${count} member${count === 1 ? "" : "s"} can see this channel.`;
        } else {
          composerHint.textContent = "Messages support plain text only.";
        }
      } else {
        messageInput.disabled = true;
        sendBtn.disabled = true;
        messageInput.placeholder = "Select a channel to start chatting";
        composerHint.textContent = "Choose a channel to enable the composer.";
      }
    } else {
      if (conversation) {
        if (blocked) {
          messageInput.disabled = true;
          sendBtn.disabled = true;
          messageInput.placeholder = "Unblock this player to send messages";
          composerHint.textContent = "You have blocked this player.";
        } else {
          messageInput.disabled = false;
          sendBtn.disabled = false;
          messageInput.placeholder = `Message ${conversation.displayName}`;
          composerHint.textContent = "Direct messages are private between you and this player.";
        }
      } else {
        messageInput.disabled = true;
        sendBtn.disabled = true;
        messageInput.placeholder = "Select a conversation to start chatting";
        composerHint.textContent = "Pick a direct message to enable the composer.";
      }
    }
  }

  function renderOnlinePlayers(): void {
    onlineList.innerHTML = "";
    refreshOnlineBtn.disabled = chatState.isLoading.onlineUsers;

    if (chatState.isLoading.onlineUsers && chatState.onlinePlayers.length === 0) {
      const loading = createElement("p", "text-sm text-[#E0E0E0]/60 text-center py-4");
      loading.textContent = "Loading online players...";
      onlineList.appendChild(loading);
      return;
    }

    const filtered = searchFilter
      ? chatState.onlinePlayers.filter((player) =>
          player.displayName.toLowerCase().includes(searchFilter)
        )
      : chatState.onlinePlayers;

    if (filtered.length === 0) {
      const empty = createElement("p", "text-sm text-[#E0E0E0]/60 text-center py-4");
      empty.textContent = chatState.onlinePlayers.length === 0 ? "No players online." : "No players match your search.";
      onlineList.appendChild(empty);
      return;
    }

    filtered.forEach((player) => {
      const isBlocked = chatState.blockedUsers.has(player.userId);
      const button = createButton(
        "",
        `w-full flex items-center gap-3 rounded px-3 py-2 transition-colors border ${
          chatState.chatMode === "dm" && chatState.currentDMUserId === player.userId
            ? "border-[#00C8FF] bg-[#00C8FF]/15"
            : "border-transparent hover:border-[#00C8FF]/40 hover:bg-[#121217]"
        } ${isBlocked ? "opacity-60" : ""}`,
        () => {
          if (isBlocked) {
            showError("Blocked Player", "Unblock this player to send messages.");
            return;
          }
          void switchToDM(player.userId, player.displayName, {
            avatarUrl: player.avatarUrl ?? null,
            status: player.status,
          });
        }
      );

      const avatar = createAvatar(
        player.displayName.substring(0, 2).toUpperCase(),
        "h-10 w-10",
        player.avatarUrl ?? null
      );
      button.appendChild(avatar);

      const meta = createDiv("flex-1 min-w-0");
      const nameRow = createDiv("flex items-center justify-between gap-2");
      const name = createElement("p", "text-sm text-[#E0E0E0] truncate");
      name.textContent = player.displayName;
      const statusBadge = createElement(
        "span",
        `text-[10px] uppercase tracking-wide px-2 py-1 rounded-full ${
          player.status === "in-game" ? "bg-[#FF8A00]/20 text-[#FF8A00]" : "bg-[#00C8FF]/20 text-[#00C8FF]"
        }`
      );
      statusBadge.textContent = player.status === "in-game" ? "In Game" : "Online";
      appendChildren(nameRow, [name, statusBadge]);

      const detail = createElement("p", "text-xs text-[#E0E0E0]/50 truncate");
      detail.textContent = isBlocked ? "Blocked • unblock to message" : `ELO ${Math.round(player.elo)}`;

      appendChildren(meta, [nameRow, detail]);
      button.appendChild(meta);

      onlineList.appendChild(button);
    });
  }

  function renderChannels(): void {
    channelsList.innerHTML = "";

    const viewerId = getUserId();

    if (chatState.isLoading.channels && chatState.channels.length === 0) {
      const loading = createElement("p", "text-sm text-[#E0E0E0]/60 text-center py-4");
      loading.textContent = "Loading channels...";
      channelsList.appendChild(loading);
      return;
    }

    const filtered = searchFilter
      ? chatState.channels.filter((channel) => {
          const term = searchFilter.toLowerCase();
          const label = getChannelLabel(channel).toLowerCase();
          return (
            label.includes(term) ||
            channel.slug.toLowerCase().includes(term)
          );
        })
      : chatState.channels;

    if (filtered.length === 0) {
      const empty = createElement("p", "text-sm text-[#E0E0E0]/60 text-center py-4");
      empty.textContent = searchFilter ? "No channels match your search." : "No channels available.";
      channelsList.appendChild(empty);
      return;
    }

    filtered.forEach((channel) => {
      const isActive = chatState.chatMode === "channel" && chatState.currentChannel === channel.slug;
      const isOwner = !!viewerId && channel.createdBy === viewerId;
      const button = createButton(
        "",
        `group w-full flex items-center justify-between rounded px-3 py-2 text-left transition-colors border ${
          isActive
            ? "border-[#00C8FF] bg-[#00C8FF]/15"
            : "border-transparent hover:border-[#00C8FF]/40 hover:bg-[#121217]"
        }`,
        () => {
          void switchChannel(channel.slug);
        }
      );

      const info = createDiv("flex items-center gap-2");
      info.appendChild(createIcon("hash", "h-4 w-4 text-[#00C8FF]"));
      const name = createElement("span", "text-sm text-[#E0E0E0]");
      name.textContent = getChannelLabel(channel);
      info.appendChild(name);

      if (isOwner) {
        const ownerBadge = createElement(
          "span",
          "text-[10px] uppercase tracking-wide text-[#00C8FF]/80 border border-[#00C8FF]/40 rounded px-2 py-0.5"
        );
        ownerBadge.textContent = "Owner";
        info.appendChild(ownerBadge);
      }

      button.appendChild(info);

      const rightStack = createDiv("flex items-center gap-2");

      if (channel.unreadCount && channel.unreadCount > 0) {
        rightStack.appendChild(createBadge(channel.unreadCount));
      } else if (typeof channel.memberCount === "number") {
        const count = createElement("span", "text-xs text-[#E0E0E0]/50");
        count.textContent = `${channel.memberCount}`;
        rightStack.appendChild(count);
      }

      if (isOwner) {
        const deleteBtn = createButton(
          "",
          "opacity-0 group-hover:opacity-100 transition-opacity border border-transparent hover:border-[#FF008C]/60 text-[#FF008C]/80 hover:text-[#FF008C] rounded-full w-7 h-7 flex items-center justify-center"
        );
        deleteBtn.addEventListener("click", (event: MouseEvent) => {
          event.stopPropagation();
          showConfirm(
            "Delete Channel",
            `Delete #${getChannelLabel(channel)}? This action cannot be undone.`,
            () => {
              void handleDeleteChannel(channel);
            }
          );
        });
        deleteBtn.appendChild(createIcon("x", "h-4 w-4"));
        rightStack.appendChild(deleteBtn);
      }

      if (rightStack.childNodes.length > 0) {
        button.appendChild(rightStack);
      }

      if (isOwner) {
        button.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          showConfirm(
            "Delete Channel",
            `Delete #${getChannelLabel(channel)}? This action cannot be undone.`,
            () => {
              void handleDeleteChannel(channel);
            }
          );
        });
      }

      channelsList.appendChild(button);
    });
  }

  function renderDMs(): void {
    dmsList.innerHTML = "";

    if (chatState.isLoading.dms && chatState.dmConversations.length === 0) {
      const loading = createElement("p", "text-sm text-[#E0E0E0]/60 text-center py-4");
      loading.textContent = "Loading conversations...";
      dmsList.appendChild(loading);
      return;
    }

    const filtered = searchFilter
      ? chatState.dmConversations.filter((dm) =>
          dm.displayName.toLowerCase().includes(searchFilter)
        )
      : chatState.dmConversations;

    if (filtered.length === 0) {
      const empty = createElement("p", "text-sm text-[#E0E0E0]/60 text-center py-4");
      empty.textContent = chatState.dmConversations.length === 0 ? "No conversations yet." : "No conversations match your search.";
      dmsList.appendChild(empty);
      return;
    }

    filtered.forEach((dm) => {
      const isActive = chatState.chatMode === "dm" && chatState.currentDMUserId === dm.userId;
      const isBlocked = chatState.blockedUsers.has(dm.userId);
      const button = createButton(
        "",
        `w-full flex items-center gap-3 rounded px-3 py-2 transition-colors border ${
          isActive
            ? "border-[#00C8FF] bg-[#00C8FF]/15"
            : "border-transparent hover:border-[#00C8FF]/40 hover:bg-[#121217]"
        } ${isBlocked ? "opacity-60" : ""}`,
        () => {
          void switchToDM(dm.userId, dm.displayName, {
            avatarUrl: dm.avatarUrl,
            status: dm.status,
            lastMessagePreview: dm.lastMessagePreview,
          });
        }
      );

      const avatar = createAvatar(
        dm.displayName.substring(0, 2).toUpperCase(),
        "h-10 w-10",
        dm.avatarUrl
      );
      button.appendChild(avatar);

      const meta = createDiv("flex-1 min-w-0");
      const nameRow = createDiv("flex items-center justify-between gap-2");
      const nameLeft = createDiv("flex items-center gap-2 min-w-0");
      const statusColor =
        dm.status === "in-game"
          ? "bg-[#FF8A00]"
          : dm.status === "online"
          ? "bg-[#00C8FF]"
          : "bg-[#E0E0E0]/30";
      const statusDot = createDiv(`h-2 w-2 rounded-full ${statusColor}`);
      const name = createElement("p", "text-sm text-[#E0E0E0] truncate");
      name.textContent = dm.displayName;
      const time = createElement("span", "text-xs text-[#E0E0E0]/50 whitespace-nowrap");
      time.textContent = dm.lastMessageAt ? formatTime(dm.lastMessageAt) : "";
      appendChildren(nameLeft, [statusDot, name]);
      appendChildren(nameRow, [nameLeft, time]);

      const preview = createElement("p", "text-xs text-[#E0E0E0]/50 truncate");
      preview.textContent = dm.lastMessagePreview ?? "No messages yet.";

      appendChildren(meta, [nameRow, preview]);
      button.appendChild(meta);

      if (!isBlocked && dm.unreadCount > 0) {
        button.appendChild(createBadge(dm.unreadCount));
      }

      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        const blocked = chatState.blockedUsers.has(dm.userId);
        showConfirm(
          blocked ? "Unblock Player" : "Block Player",
          blocked
            ? `Allow ${dm.displayName} to message you again?`
            : `Block ${dm.displayName}? You won't receive messages while blocked.`,
          () => {
            if (blocked) {
              void handleUnblockUser(dm.userId, dm.displayName);
            } else {
              void handleBlockUser(dm.userId, dm.displayName);
            }
          }
        );
      });

      dmsList.appendChild(button);
    });
  }

  function renderBlockedUsers(): void {
    blockedList.innerHTML = "";

    if (chatState.isLoading.blocked && chatState.blockedEntries.length === 0) {
      const loading = createElement("p", "text-sm text-[#E0E0E0]/60 text-center py-4");
      loading.textContent = "Loading blocked players...";
      blockedList.appendChild(loading);
      return;
    }

    const filtered = searchFilter
      ? chatState.blockedEntries.filter((entry) =>
          entry.displayName.toLowerCase().includes(searchFilter)
        )
      : chatState.blockedEntries;

    if (filtered.length === 0) {
      const empty = createElement("p", "text-sm text-[#E0E0E0]/60 text-center py-4");
      empty.textContent = chatState.blockedEntries.length === 0
        ? "You're not blocking anyone."
        : "No blocked players match your search.";
      blockedList.appendChild(empty);
      return;
    }

    filtered.forEach((entry) => {
      const row = createDiv("flex items-center justify-between gap-3 rounded px-3 py-2 border border-[#00C8FF]/20 bg-[#121217]/80");

      const left = createDiv("flex items-center gap-3");
      left.appendChild(
        createAvatar(entry.displayName.substring(0, 2).toUpperCase(), "h-9 w-9", entry.avatarUrl)
      );

      const meta = createDiv("flex flex-col");
      const name = createElement("span", "text-sm text-[#E0E0E0]");
      name.textContent = entry.displayName;
      const blockedSince = createElement("span", "text-xs text-[#E0E0E0]/50");
      blockedSince.textContent = `Blocked ${formatTime(entry.blockedAt)}`;
      appendChildren(meta, [name, blockedSince]);
      appendChildren(left, [meta]);

      const unblockBtn = createButton(
        "Unblock",
        "text-xs uppercase tracking-wide border border-[#FF008C]/40 text-[#FF008C] hover:border-[#FF008C] hover:bg-[#FF008C]/10 px-3 py-1.5 rounded transition-colors"
      );
      unblockBtn.addEventListener("click", () => {
        void handleUnblockUser(entry.userId, entry.displayName);
      });

      appendChildren(row, [left, unblockBtn]);
      blockedList.appendChild(row);
    });
  }

  function renderMessages(): void {
    messagesArea.innerHTML = "";

    if (chatState.chatMode === "channel") {
      if (!chatState.currentChannel) {
        const empty = createElement("p", "text-sm text-[#E0E0E0]/60 text-center py-12");
        empty.textContent = "Select a channel to view messages.";
        messagesArea.appendChild(empty);
        return;
      }

      if (chatState.isLoading.messages) {
        const loading = createElement("p", "text-sm text-[#E0E0E0]/60 text-center py-12");
        loading.textContent = "Loading messages...";
        messagesArea.appendChild(loading);
        return;
      }

      if (chatState.messages.length === 0) {
        const empty = createElement("p", "text-sm text-[#E0E0E0]/60 text-center py-12");
        empty.textContent = "No messages yet. Start the conversation!";
        messagesArea.appendChild(empty);
        return;
      }
    } else {
      const conversation = getActiveConversation();
      if (!conversation) {
        const empty = createElement("p", "text-sm text-[#E0E0E0]/60 text-center py-12");
        empty.textContent = "Select a conversation to view messages.";
        messagesArea.appendChild(empty);
        return;
      }

      if (chatState.blockedUsers.has(conversation.userId)) {
        const blocked = createDiv("rounded border border-[#FF008C]/40 bg-[#FF008C]/10 px-4 py-3 text-sm text-[#FF008C]");
        blocked.textContent = `You have blocked ${conversation.displayName}. Unblock them to resume chatting.`;
        messagesArea.appendChild(blocked);
        return;
      }

      if (chatState.isLoading.messages) {
        const loading = createElement("p", "text-sm text-[#E0E0E0]/60 text-center py-12");
        loading.textContent = "Loading messages...";
        messagesArea.appendChild(loading);
        return;
      }

      if (chatState.messages.length === 0) {
        const empty = createElement("p", "text-sm text-[#E0E0E0]/60 text-center py-12");
        empty.textContent = "No messages yet. Say hello!";
        messagesArea.appendChild(empty);
        return;
      }
    }

    const viewerId = getUserId();

    chatState.messages.forEach((msg) => {
      const isSelf = viewerId !== null && msg.userId === viewerId && chatState.chatMode === "dm";
      const row = createDiv(`flex gap-3 ${isSelf ? "flex-row-reverse text-right" : ""}`);
      const safeDisplayName = msg.displayName?.trim() || getFallbackDisplayName(msg.userId);
      const initials = safeDisplayName.substring(0, 2).toUpperCase();
      let avatarUrl: string | null = null;
      if (chatState.chatMode === "dm") {
        const conversation = getActiveConversation();
        if (conversation && msg.userId === conversation.userId) {
          avatarUrl = conversation.avatarUrl;
        }
      }
      row.appendChild(createAvatar(initials, isSelf ? "h-8 w-8" : "h-10 w-10", avatarUrl));

      const bubble = createDiv(
        `max-w-[70%] rounded border ${
          isSelf
            ? "border-[#00C8FF]/40 bg-[#00C8FF]/10"
            : "border-[#00C8FF]/20 bg-[#121217]"
        } px-3 py-2`
      );
      const headerRow = createDiv("flex items-baseline gap-2");
      const author = createElement("span", isSelf ? "text-[#00C8FF]" : "text-[#E0E0E0]");
      author.textContent = safeDisplayName;
      const time = createElement("span", "text-xs text-[#E0E0E0]/50");
      time.textContent = formatTime(msg.timestamp);
      appendChildren(headerRow, isSelf ? [time, author] : [author, time]);

      const body = createElement("p", "text-sm text-[#E0E0E0]");
      body.textContent = msg.content;

      appendChildren(bubble, [headerRow, body]);
      row.appendChild(bubble);
      messagesArea.appendChild(row);
    });

    requestAnimationFrame(() => {
      messagesArea.scrollTop = messagesArea.scrollHeight;
    });
  }

  function openCreateChannelDialog(): void {
    if (chatState.isCreatingChannel) {
      return;
    }

    showPrompt(
      "Create Channel",
      "Enter a name for your new channel. Letters, numbers, spaces, hyphens, and underscores are allowed.",
      (value: string) => {
        void handleCreateChannelSubmit(value);
      },
      undefined,
      "Friendly Matches"
    );
  }

  async function handleCreateChannelSubmit(rawValue: string): Promise<void> {
    const trimmed = rawValue.trim();

    if (!trimmed) {
      showError("Channel Name Required", "Please enter a channel name to continue.");
      return;
    }

    if (trimmed.length < 3) {
      showError("Name Too Short", "Channel names must be at least 3 characters.");
      return;
    }

    if (trimmed.length > 60) {
      showError("Name Too Long", "Channel names cannot exceed 60 characters.");
      return;
    }

  if (/[^a-zA-Z0-9\s_-]/.test(trimmed)) {
      showError("Invalid Characters", "Use only letters, numbers, spaces, hyphens, or underscores.");
      return;
    }

    if (chatState.isCreatingChannel) {
      return;
    }

    chatState.isCreatingChannel = true;
    const previousLabel = createChannelBtn.textContent || "New Channel";
    createChannelBtn.disabled = true;
    createChannelBtn.textContent = "Creating...";

    try {
      const result = await createChannel({ title: trimmed });
      const newChannel = result.channel;

      chatState.channels = [newChannel, ...chatState.channels.filter((channel) => channel.slug !== newChannel.slug)];
      chatState.chatMode = "channel";
      chatState.currentChannel = newChannel.slug;
      chatState.currentDMUserId = null;
      chatState.messages = [];
      chatWS.joinRoom(newChannel.slug);

      notify.channels();
      notify.messages();

      showSuccess("Channel Created", `#${getChannelLabel(newChannel)} is ready for messages.`);

      await loadChannelHistory(newChannel.slug);
      void loadChannels();
    } catch (error) {
      console.error("Failed to create channel:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create channel. Please try again.";
      showError("Channel Creation Failed", message);
    } finally {
      chatState.isCreatingChannel = false;
      createChannelBtn.disabled = false;
      createChannelBtn.textContent = previousLabel;
    }
  }

  function sendMessage(): void {
    const text = messageInput.value.trim();
    if (!text) {
      return;
    }

    if (chatState.chatMode === "channel" && !chatState.currentChannel) {
      return;
    }

    if (chatState.chatMode === "dm" && !chatState.currentDMUserId) {
      return;
    }

    messageInput.disabled = true;
    sendBtn.disabled = true;

    sendChatMessage(text)
      .then(() => {
        messageInput.value = "";
      })
      .catch((error) => {
        console.error("Send message error:", error);
      })
      .finally(() => {
        messageInput.disabled = false;
        sendBtn.disabled = false;
        updateComposerState();
        messageInput.focus();
      });
  }

  chatState.callbacks.channelsUpdate = () => {
    renderChannels();
    updateHeader();
    updateComposerState();
    renderOnlinePlayers();
  };

  chatState.callbacks.dmsUpdate = () => {
    renderDMs();
    updateHeader();
    updateComposerState();
    renderOnlinePlayers();
  };

  chatState.callbacks.messagesUpdate = () => {
    updateHeader();
    updateComposerState();
    renderMessages();
    renderOnlinePlayers();
  };

  chatState.callbacks.blockedListUpdate = () => {
    renderBlockedUsers();
  };

  chatState.callbacks.onlineUsersUpdate = () => {
    renderOnlinePlayers();
  };

  renderChannels();
  renderDMs();
  renderBlockedUsers();
  renderOnlinePlayers();
  updateHeader();
  updateComposerState();
  renderMessages();

  void loadBlockedUsers();
  void loadDMConversations();
  void loadOnlinePlayers();

  loadChannels().then(() => {
    if (chatState.channels.length > 0 && !chatState.currentChannel) {
      void switchChannel(chatState.channels[0].slug);
    }
  });

  if (chatState.onlineRefreshInterval !== null) {
    window.clearInterval(chatState.onlineRefreshInterval);
  }

  chatState.onlineRefreshInterval = window.setInterval(() => {
    void loadOnlinePlayers();
  }, 30_000);

  if (!chatState.onlineRefreshListenerRegistered) {
    window.addEventListener("beforeunload", () => {
      if (chatState.onlineRefreshInterval !== null) {
        window.clearInterval(chatState.onlineRefreshInterval);
        chatState.onlineRefreshInterval = null;
      }
    });
    chatState.onlineRefreshListenerRegistered = true;
  }

  initializeWebSocket();

  return container;
}
