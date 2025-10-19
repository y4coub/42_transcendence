import { createInitialChatState, type ChatState } from "./types";

export const chatState: ChatState = createInitialChatState();

export const notify = {
  channels: () => chatState.callbacks.channelsUpdate?.(),
  messages: () => chatState.callbacks.messagesUpdate?.(),
  dms: () => chatState.callbacks.dmsUpdate?.(),
  blocked: () => chatState.callbacks.blockedListUpdate?.(),
  onlineUsers: () => chatState.callbacks.onlineUsersUpdate?.(),
};
