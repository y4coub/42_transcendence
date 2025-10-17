import { logger } from '@infra/observability/logger';
import {
  chatBlockCreateSchema,
  chatBlockSchema,
  chatChannelCreateSchema,
  chatChannelMessageCreateSchema,
  chatChannelUpdateSchema,
  chatDirectMessageCreateSchema,
  chatMessageQuerySchema,
  ChatBlock,
  ChatChannel,
  ChatMembership,
  ChatMessage,
} from './schemas';
import {
  addMembership,
  appendChannelMessage,
  appendDirectMessage,
  createChannel as createChannelRecord,
  deleteChannel as deleteChannelRecord,
  getChannelById,
  getChannelBySlug,
  isBlocked,
  isUserChannelAdmin,
  listBlocksForUser,
  listChannelMessages as listChannelMessagesFromStore,
  listChannels,
  listDirectMessages as listDirectMessagesFromStore,
  listMembershipsForChannel,
  listMembershipsForUser,
  listRecentConversations as listRecentConversationsFromStore,
  removeBlock,
  removeMembership,
  setMembershipRole,
  updateChannel as updateChannelRecord,
  upsertBlock,
} from './repository';

export type ChatServiceErrorCode =
  | 'CHANNEL_NOT_FOUND'
  | 'CHANNEL_SLUG_IN_USE'
  | 'NOT_CHANNEL_MEMBER'
  | 'NOT_CHANNEL_ADMIN'
  | 'USER_BLOCKED'
  | 'SELF_ACTION_NOT_ALLOWED';

export class ChatServiceError extends Error {
  constructor(public readonly code: ChatServiceErrorCode, message: string) {
    super(message);
    this.name = 'ChatServiceError';
  }
}

const ensureChannel = (channel: ChatChannel | undefined | null): ChatChannel => {
  if (!channel) {
    throw new ChatServiceError('CHANNEL_NOT_FOUND', 'Channel not found');
  }

  return channel;
};

const getMembership = (channelId: string, userId: string): ChatMembership | undefined => {
  return listMembershipsForUser(userId).find((membership) => membership.channelId === channelId);
};

const assertChannelMember = (channelId: string, userId: string): ChatMembership => {
  const membership = getMembership(channelId, userId);
  if (!membership) {
    throw new ChatServiceError('NOT_CHANNEL_MEMBER', 'User is not a member of this channel');
  }

  return membership;
};

const assertChannelAdmin = (channelId: string, userId: string): void => {
  if (!isUserChannelAdmin(channelId, userId)) {
    throw new ChatServiceError('NOT_CHANNEL_ADMIN', 'Administrator permissions required for this operation');
  }
};

const ensureMembershipRecord = (membership: ChatMembership | null): ChatMembership => {
  if (!membership) {
    throw new Error('Failed to persist membership record');
  }

  return membership;
};

const ensureMessageRecord = (message: ChatMessage | null): ChatMessage => {
  if (!message) {
    throw new Error('Failed to persist chat message');
  }

  return message;
};

const slugify = (value: string): string => {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return normalized.length > 0 ? normalized : 'channel';
};

const resolveSlug = (baseSlug: string, allowSuffix: boolean): string => {
  if (!allowSuffix) {
    if (getChannelBySlug(baseSlug)) {
      throw new ChatServiceError('CHANNEL_SLUG_IN_USE', 'Channel slug already in use');
    }

    return baseSlug;
  }

  let suffix = 1;
  let candidate = baseSlug;

  while (getChannelBySlug(candidate)) {
    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }

  return candidate;
};

const buildBlockDecisionCache = (userId: string) => {
  const cache = new Map<string, boolean>();
  return (otherUserId: string) => {
    if (otherUserId === userId) {
      return false;
    }

    if (!cache.has(otherUserId)) {
      cache.set(otherUserId, isBlocked(userId, otherUserId));
    }

    return cache.get(otherUserId) ?? false;
  };
};

export const listAvailableChannels = (): ChatChannel[] => {
  return listChannels();
};

export const loadChannelBySlug = (slug: string): ChatChannel => {
  return ensureChannel(getChannelBySlug(slug));
};

export const loadChannelById = (channelId: string): ChatChannel => {
  return ensureChannel(getChannelById(channelId));
};

export const listChannelMembers = (channelId: string): ChatMembership[] => {
  return listMembershipsForChannel(channelId);
};

export const listUserMemberships = (userId: string): ChatMembership[] => {
  return listMembershipsForUser(userId);
};

export const createChannel = (
  userId: string,
  payload: unknown,
): { channel: ChatChannel; membership: ChatMembership } => {
  const parsed = chatChannelCreateSchema.parse(payload);
  const baseSlug = parsed.slug ?? slugify(parsed.title);
  const slug = resolveSlug(baseSlug, !parsed.slug);

  const channelRecord = createChannelRecord({
    slug,
    title: parsed.title,
    visibility: parsed.visibility,
    createdBy: userId,
  });

  const channel = ensureChannel(channelRecord);
  const membership = ensureMembershipRecord(addMembership(channel.id, userId, 'admin'));

  return {
    channel,
    membership,
  };
};

export const updateChannel = (userId: string, channelId: string, updates: unknown): ChatChannel => {
  const channel = ensureChannel(getChannelById(channelId));
  assertChannelAdmin(channel.id, userId);

  const parsedUpdates = chatChannelUpdateSchema.parse(updates);
  const updated = updateChannelRecord(channel.id, parsedUpdates);

  return ensureChannel(updated);
};

export const deleteChannel = (userId: string, channelId: string): void => {
  const channel = ensureChannel(getChannelById(channelId));
  assertChannelAdmin(channel.id, userId);

  deleteChannelRecord(channel.id);
};

export const joinChannelBySlug = (userId: string, slug: string): ChatMembership => {
  const channel = ensureChannel(getChannelBySlug(slug));
  return ensureMembershipRecord(addMembership(channel.id, userId, 'member'));
};

export const leaveChannel = (userId: string, channelId: string): void => {
  const channel = ensureChannel(getChannelById(channelId));
  const membership = assertChannelMember(channel.id, userId);

  removeMembership(channel.id, userId);

  if (membership.role === 'admin') {
    const remainingMembers = listMembershipsForChannel(channel.id);
    const hasAdmin = remainingMembers.some((member) => member.role === 'admin');

    if (!hasAdmin && remainingMembers.length > 0) {
      const promoted = remainingMembers[0];
      setMembershipRole(channel.id, promoted.userId, 'admin');
      logger.info({ channelId: channel.id, promotedUserId: promoted.userId }, 'Promoted member to admin after last admin left');
    }
  }
};

export const promoteMemberToAdmin = (
  requestorId: string,
  channelId: string,
  targetUserId: string,
): ChatMembership => {
  const channel = ensureChannel(getChannelById(channelId));
  assertChannelAdmin(channel.id, requestorId);
  assertChannelMember(channel.id, targetUserId);

  return ensureMembershipRecord(setMembershipRole(channel.id, targetUserId, 'admin'));
};

export const demoteAdminToMember = (
  requestorId: string,
  channelId: string,
  targetUserId: string,
): ChatMembership => {
  const channel = ensureChannel(getChannelById(channelId));
  assertChannelAdmin(channel.id, requestorId);
  const targetMembership = assertChannelMember(channel.id, targetUserId);

  if (targetMembership.role !== 'admin') {
    return targetMembership;
  }

  const admins = listMembershipsForChannel(channel.id).filter((member) => member.role === 'admin');
  if (admins.length <= 1) {
    throw new ChatServiceError('NOT_CHANNEL_ADMIN', 'Cannot demote the last channel administrator');
  }

  return ensureMembershipRecord(setMembershipRole(channel.id, targetUserId, 'member'));
};

export const sendChannelMessage = (userId: string, slug: string, payload: unknown): ChatMessage => {
  const channel = ensureChannel(getChannelBySlug(slug));
  assertChannelMember(channel.id, userId);

  const messagePayload = chatChannelMessageCreateSchema.parse(payload);
  return ensureMessageRecord(
    appendChannelMessage({
      channelId: channel.id,
      senderId: userId,
      content: messagePayload.content,
    }),
  );
};

export const listChannelMessages = (userId: string, slug: string, query: unknown): ChatMessage[] => {
  const channel = ensureChannel(getChannelBySlug(slug));
  assertChannelMember(channel.id, userId);

  const options = chatMessageQuerySchema.parse(query ?? {});
  const messages = listChannelMessagesFromStore(channel.id, {
    limit: options.limit,
    since: options.since,
  });

  const isUserBlocked = buildBlockDecisionCache(userId);

  return messages.filter((message) => !isUserBlocked(message.senderId));
};

export const sendDirectMessage = (senderId: string, targetUserId: string, payload: unknown): ChatMessage => {
  if (senderId === targetUserId) {
    throw new ChatServiceError('SELF_ACTION_NOT_ALLOWED', 'Cannot send messages to yourself');
  }

  if (isBlocked(senderId, targetUserId)) {
    throw new ChatServiceError('USER_BLOCKED', 'Cannot deliver message to or from a blocked user');
  }

  const messagePayload = chatDirectMessageCreateSchema.parse(payload);
  return ensureMessageRecord(
    appendDirectMessage({
      senderId,
      targetId: targetUserId,
      content: messagePayload.content,
    }),
  );
};

export const listDirectMessages = (userId: string, counterpartId: string, query: unknown): ChatMessage[] => {
  if (isBlocked(userId, counterpartId)) {
    throw new ChatServiceError('USER_BLOCKED', 'Cannot view history for a blocked conversation');
  }

  const options = chatMessageQuerySchema.parse(query ?? {});
  return listDirectMessagesFromStore(userId, counterpartId, {
    limit: options.limit,
    since: options.since,
  });
};

export const blockUser = (blockerId: string, blockedId: string, payload: unknown): ChatBlock => {
  if (blockerId === blockedId) {
    throw new ChatServiceError('SELF_ACTION_NOT_ALLOWED', 'Cannot block yourself');
  }

  const parsed = chatBlockCreateSchema.parse(payload ?? {});
  const record = upsertBlock({
    blockerId,
    blockedId,
    reason: parsed.reason,
  });

  return chatBlockSchema.parse(record);
};

export const unblockUser = (blockerId: string, blockedId: string): boolean => {
  return removeBlock(blockerId, blockedId) > 0;
};

export const listBlocks = (blockerId: string): ChatBlock[] => {
  return listBlocksForUser(blockerId);
};

export const isConversationBlocked = (userId: string, counterpartId: string): boolean => {
  return isBlocked(userId, counterpartId);
};

export const listRecentConversations = (userId: string, limit?: number) => {
  const conversations = listRecentConversationsFromStore(userId, limit ?? 20);
  const isUserBlocked = buildBlockDecisionCache(userId);

  return conversations.filter((conversation) => !isUserBlocked(conversation.otherId));
};