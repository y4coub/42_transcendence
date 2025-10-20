import { createInitialChatState, type ChatState, type ConversationPreview, type DisplayMessage } from "./types";

export const chatState: ChatState = createInitialChatState();

export const notify = {
  channels: () => chatState.callbacks.channelsUpdate?.(),
  messages: () => chatState.callbacks.messagesUpdate?.(),
  dms: () => chatState.callbacks.dmsUpdate?.(),
  blocked: () => chatState.callbacks.blockedListUpdate?.(),
  onlineUsers: () => chatState.callbacks.onlineUsersUpdate?.(),
};

export interface SystemMessageOptions {
  displayName?: string;
  avatarUrl?: string | null;
  logLocally?: boolean;
}

export function appendDMSystemMessage(userId: string, preview: string, options: SystemMessageOptions = {}): void {
  const timestamp = new Date().toISOString();
  const safeName = options.displayName && options.displayName.trim().length > 0
    ? options.displayName.trim()
    : `Player ${userId.slice(0, 6)}`;
  const avatarUrl = options.avatarUrl ?? null;

  const existing = chatState.dmConversations.find((dm) => dm.userId === userId);

  if (existing) {
    const updated: ConversationPreview = {
      ...existing,
      displayName: safeName,
      avatarUrl: existing.avatarUrl ?? avatarUrl,
      lastMessageAt: timestamp,
      lastMessagePreview: preview,
    };

    const others = chatState.dmConversations.filter((dm) => dm.userId !== userId);
    const nextList = [updated, ...others];
    nextList.sort((a, b) => {
      const aTs = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTs = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTs - aTs;
    });
    chatState.dmConversations = nextList;
  } else {
    const entry: ConversationPreview = {
      userId,
      displayName: safeName,
      avatarUrl,
      lastMessageAt: timestamp,
      lastMessagePreview: preview,
      unreadCount: 0,
      status: 'offline',
    };
    chatState.dmConversations = [entry, ...chatState.dmConversations];
  }

  notify.dms();

  if (
    (options.logLocally ?? true) &&
    chatState.chatMode === 'dm' &&
    chatState.currentDMUserId === userId
  ) {
    const entry: DisplayMessage = {
      id: `system-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      userId: 'system',
      displayName: 'System',
      content: preview,
      timestamp,
      avatarUrl: null,
    };
    chatState.messages.push(entry);
    notify.messages();
  }
}
