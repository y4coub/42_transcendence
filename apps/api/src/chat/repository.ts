import { randomUUID } from 'node:crypto';

import { Database } from 'better-sqlite3';

import { getDatabase } from '@infra/db/client';
import { chatBlockSchema, chatChannelSchema, chatMembershipSchema, chatMessageSchema } from './schemas';

const mapRow = <T>(row: Record<string, unknown> | undefined, schema: { parse: (value: unknown) => T }) => {
  if (!row) {
    return undefined;
  }

  return schema.parse(row);
};

const mapRows = <T>(rows: Record<string, unknown>[], schema: { parse: (value: unknown) => T }) => {
  return rows.map((row) => schema.parse(row));
};

const selectChannel = `
  SELECT
    id,
    slug,
    title,
    visibility,
    created_by AS createdBy,
    STRFTIME('%Y-%m-%dT%H:%M:%fZ', created_at) AS createdAt
  FROM chat_channels
`;

const selectMembership = `
  SELECT
    channel_id AS channelId,
    user_id AS userId,
    role,
    STRFTIME('%Y-%m-%dT%H:%M:%fZ', joined_at) AS joinedAt
  FROM chat_memberships
`;

const selectMessage = `
  SELECT
    id,
    channel_id AS channelId,
    sender_id AS senderId,
    content,
    type,
    dm_target_id AS dmTargetId,
    STRFTIME('%Y-%m-%dT%H:%M:%fZ', created_at) AS createdAt
  FROM chat_messages
`;

const selectBlock = `
  SELECT
    blocker_id AS blockerId,
    blocked_id AS blockedId,
    reason,
    STRFTIME('%Y-%m-%dT%H:%M:%fZ', created_at) AS createdAt
  FROM chat_blocks
`;

export interface CreateChannelInput {
  slug: string;
  title: string;
  visibility: 'public' | 'private';
  createdBy: string;
}

export const createChannel = (input: CreateChannelInput) => {
  const db = getDatabase();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO chat_channels (id, slug, title, visibility, created_by)
     VALUES (@id, @slug, @title, @visibility, @created_by)`,
  ).run({
    id,
    slug: input.slug,
    title: input.title,
    visibility: input.visibility,
    created_by: input.createdBy,
  });

  const row = db.prepare(`${selectChannel} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return mapRow(row, chatChannelSchema) ?? null;
};

export const getChannelById = (channelId: string) => {
  const row = getDatabase()
    .prepare(`${selectChannel} WHERE id = ?`)
    .get(channelId) as Record<string, unknown> | undefined;

  return mapRow(row, chatChannelSchema);
};

export const getChannelBySlug = (slug: string) => {
  const row = getDatabase()
    .prepare(`${selectChannel} WHERE slug = ? COLLATE NOCASE`)
    .get(slug) as Record<string, unknown> | undefined;

  return mapRow(row, chatChannelSchema);
};

export const listChannels = () => {
  const rows = getDatabase().prepare(`${selectChannel} ORDER BY created_at DESC`).all() as Record<string, unknown>[];
  return mapRows(rows, chatChannelSchema);
};

export const updateChannel = (
  channelId: string,
  updates: Partial<Pick<CreateChannelInput, 'title' | 'visibility'>>,
) => {
  const db = getDatabase();
  const sets: string[] = [];
  const params: Record<string, unknown> = { id: channelId };

  if (updates.title !== undefined) {
    sets.push('title = @title');
    params.title = updates.title;
  }

  if (updates.visibility !== undefined) {
    sets.push('visibility = @visibility');
    params.visibility = updates.visibility;
  }

  if (sets.length === 0) {
    return getChannelById(channelId) ?? null;
  }

  db.prepare(`UPDATE chat_channels SET ${sets.join(', ')} WHERE id = @id`).run(params);
  return getChannelById(channelId) ?? null;
};

export const deleteChannel = (channelId: string) => {
  const result = getDatabase()
    .prepare('DELETE FROM chat_channels WHERE id = ?')
    .run(channelId);

  return result.changes ?? 0;
};

export const addMembership = (channelId: string, userId: string, role: 'member' | 'admin' = 'member') => {
  const db = getDatabase();
  db.prepare(
    `INSERT INTO chat_memberships (channel_id, user_id, role)
     VALUES (@channel_id, @user_id, @role)
     ON CONFLICT(channel_id, user_id) DO UPDATE SET role = excluded.role`,
  ).run({
    channel_id: channelId,
    user_id: userId,
    role,
  });

  const row = db
    .prepare(`${selectMembership} WHERE channel_id = @channel_id AND user_id = @user_id`)
    .get({ channel_id: channelId, user_id: userId }) as Record<string, unknown> | undefined;

  return mapRow(row, chatMembershipSchema) ?? null;
};

export const removeMembership = (channelId: string, userId: string) => {
  const result = getDatabase()
    .prepare('DELETE FROM chat_memberships WHERE channel_id = @channel_id AND user_id = @user_id')
    .run({ channel_id: channelId, user_id: userId });

  return result.changes ?? 0;
};

export const listMembershipsForChannel = (channelId: string) => {
  const rows = getDatabase()
    .prepare(`${selectMembership} WHERE channel_id = ? ORDER BY joined_at ASC`)
    .all(channelId) as Record<string, unknown>[];

  return mapRows(rows, chatMembershipSchema);
};

export const listMembershipsForUser = (userId: string) => {
  const rows = getDatabase()
    .prepare(`${selectMembership} WHERE user_id = ? ORDER BY joined_at DESC`)
    .all(userId) as Record<string, unknown>[];

  return mapRows(rows, chatMembershipSchema);
};

export interface AppendChannelMessageInput {
  channelId: string;
  senderId: string;
  content: string;
}

export interface AppendDirectMessageInput {
  senderId: string;
  targetId: string;
  content: string;
}

const insertMessage = (
  db: Database,
  values: {
    id: string;
    channel_id: string | null;
    sender_id: string;
    content: string;
    type: 'channel' | 'dm';
    dm_target_id: string | null;
  },
) => {
  db.prepare(
    `INSERT INTO chat_messages (id, channel_id, sender_id, content, type, dm_target_id)
     VALUES (@id, @channel_id, @sender_id, @content, @type, @dm_target_id)`,
  ).run(values);

  const row = db.prepare(`${selectMessage} WHERE id = ?`).get(values.id) as Record<string, unknown> | undefined;
  return mapRow(row, chatMessageSchema) ?? null;
};

export const appendChannelMessage = (input: AppendChannelMessageInput) => {
  const db = getDatabase();
  return insertMessage(db, {
    id: randomUUID(),
    channel_id: input.channelId,
    sender_id: input.senderId,
    content: input.content,
    type: 'channel',
    dm_target_id: null,
  });
};

export const appendDirectMessage = (input: AppendDirectMessageInput) => {
  const db = getDatabase();
  return insertMessage(db, {
    id: randomUUID(),
    channel_id: null,
    sender_id: input.senderId,
    content: input.content,
    type: 'dm',
    dm_target_id: input.targetId,
  });
};

export interface ListChannelMessagesOptions {
  limit?: number;
  since?: string;
}

export const listChannelMessages = (channelId: string, options: ListChannelMessagesOptions = {}) => {
  const db = getDatabase();
  const clauses: string[] = ['channel_id = @channel_id'];
  const params: Record<string, unknown> = {
    channel_id: channelId,
  };

  if (options.since) {
    clauses.push('created_at >= @since');
    params.since = options.since;
  }

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  params.limit = limit;

  const rows = db
    .prepare(`${selectMessage} WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT @limit`)
    .all(params) as Record<string, unknown>[];

  return mapRows(rows, chatMessageSchema);
};

export interface ListDirectMessagesOptions {
  limit?: number;
  since?: string;
}

export const listDirectMessages = (
  userId: string,
  counterpartId: string,
  options: ListDirectMessagesOptions = {},
) => {
  const db = getDatabase();

  const params: Record<string, unknown> = {
    user: userId,
    counter: counterpartId,
  };

  if (options.since) {
    params.since = options.since;
  }

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  params.limit = limit;

  const whereClauses = [`type = 'dm'`, `(sender_id = @user AND dm_target_id = @counter)`, `(sender_id = @counter AND dm_target_id = @user)`];

  const sinceClause = options.since ? 'AND created_at >= @since' : '';

  const query = `${selectMessage}
    WHERE ${whereClauses[0]} AND (${whereClauses[1]} OR ${whereClauses[2]}) ${sinceClause}
    ORDER BY created_at DESC
    LIMIT @limit`;

  const rows = db.prepare(query).all(params) as Record<string, unknown>[];

  return mapRows(rows, chatMessageSchema);
};

export const getMessageById = (messageId: string) => {
  const row = getDatabase()
    .prepare(`${selectMessage} WHERE id = ?`)
    .get(messageId) as Record<string, unknown> | undefined;

  return mapRow(row, chatMessageSchema);
};

export const deleteMessage = (messageId: string) => {
  const result = getDatabase().prepare('DELETE FROM chat_messages WHERE id = ?').run(messageId);
  return result.changes ?? 0;
};

export const setMembershipRole = (channelId: string, userId: string, role: 'member' | 'admin') => {
  const db = getDatabase();
  db.prepare(
    `UPDATE chat_memberships SET role = @role WHERE channel_id = @channel_id AND user_id = @user_id`,
  ).run({
    role,
    channel_id: channelId,
    user_id: userId,
  });

  const row = db
    .prepare(`${selectMembership} WHERE channel_id = @channel_id AND user_id = @user_id`)
    .get({ channel_id: channelId, user_id: userId }) as Record<string, unknown> | undefined;

  return mapRow(row, chatMembershipSchema) ?? null;
};

export const isUserChannelAdmin = (channelId: string, userId: string) => {
  const row = getDatabase()
    .prepare(
      `${selectMembership} WHERE channel_id = @channel_id AND user_id = @user_id AND role = 'admin'`,
    )
    .get({ channel_id: channelId, user_id: userId }) as Record<string, unknown> | undefined;

  return row !== undefined;
};

export const countChannelMembers = (channelId: string) => {
  const result = getDatabase()
    .prepare('SELECT COUNT(*) AS count FROM chat_memberships WHERE channel_id = ?')
    .get(channelId) as { count: number } | undefined;

  return result?.count ?? 0;
};

export interface UpsertBlockInput {
  blockerId: string;
  blockedId: string;
  reason?: string;
}

export const upsertBlock = (input: UpsertBlockInput) => {
  const db = getDatabase();
  db.prepare(
    `INSERT INTO chat_blocks (blocker_id, blocked_id, reason)
     VALUES (@blocker_id, @blocked_id, @reason)
     ON CONFLICT(blocker_id, blocked_id) DO UPDATE SET reason = excluded.reason`,
  ).run({
    blocker_id: input.blockerId,
    blocked_id: input.blockedId,
    reason: input.reason ?? null,
  });

  const row = db
    .prepare(`${selectBlock} WHERE blocker_id = @blocker_id AND blocked_id = @blocked_id`)
    .get({ blocker_id: input.blockerId, blocked_id: input.blockedId }) as Record<string, unknown> | undefined;

  return mapRow(row, chatBlockSchema) ?? null;
};

export const removeBlock = (blockerId: string, blockedId: string) => {
  const result = getDatabase()
    .prepare('DELETE FROM chat_blocks WHERE blocker_id = @blocker_id AND blocked_id = @blocked_id')
    .run({ blocker_id: blockerId, blocked_id: blockedId });

  return result.changes ?? 0;
};

export const listBlocksForUser = (blockerId: string) => {
  const rows = getDatabase()
    .prepare(`${selectBlock} WHERE blocker_id = ? ORDER BY created_at DESC`)
    .all(blockerId) as Record<string, unknown>[];

  return mapRows(rows, chatBlockSchema);
};

export const isBlocked = (userId: string, potentialCounterpart: string) => {
  const db = getDatabase();
  const row = db
    .prepare(
      `${selectBlock} WHERE (blocker_id = @user AND blocked_id = @counter) OR (blocker_id = @counter AND blocked_id = @user)`,
    )
    .get({ user: userId, counter: potentialCounterpart }) as Record<string, unknown> | undefined;

  return row !== undefined;
};

export const listRecentConversations = (userId: string, limit: number = 20) => {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT DISTINCT otherId, lastMessageAt FROM (
        SELECT
          CASE WHEN sender_id = @user THEN dm_target_id ELSE sender_id END AS otherId,
          MAX(created_at) AS lastMessageAt
        FROM chat_messages
        WHERE type = 'dm' AND (sender_id = @user OR dm_target_id = @user)
        GROUP BY otherId
      )
      ORDER BY lastMessageAt DESC
      LIMIT @limit`,
    )
    .all({ user: userId, limit }) as Array<{ otherId: string | null; lastMessageAt: string | null }>;
  return rows
    .filter((row) => typeof row.otherId === 'string' && row.otherId.length > 0)
    .map((row) => ({
      otherId: String(row.otherId),
      lastMessageAt: row.lastMessageAt
        ? new Date(row.lastMessageAt).toISOString()
        : new Date().toISOString(),
    }));
};

/**
 * Get chat messages for a specific match
 * Used for in-game chat during Pong matches (Phase 6: T034)
 */
export interface ListMatchMessagesOptions {
  limit?: number;
  since?: string;
}

export const listMatchMessages = (matchId: string, options: ListMatchMessagesOptions = {}) => {
  const db = getDatabase();
  const clauses: string[] = ['matchId = @matchId'];
  const params: Record<string, unknown> = {
    matchId,
  };

  if (options.since) {
    clauses.push('created_at >= @since');
    params.since = options.since;
  }

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  params.limit = limit;

  const rows = db
    .prepare(`${selectMessage} WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT @limit`)
    .all(params) as Record<string, unknown>[];

  return mapRows(rows, chatMessageSchema);
};

/**
 * Append a chat message to a match
 * Used for in-game chat during Pong matches (Phase 6: T034)
 */
export interface AppendMatchMessageInput {
  matchId: string;
  senderId: string;
  content: string;
}

export const appendMatchMessage = (input: AppendMatchMessageInput) => {
  const db = getDatabase();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO chat_messages (id, channel_id, sender_id, content, type, dm_target_id, matchId)
     VALUES (@id, NULL, @sender_id, @content, 'channel', NULL, @matchId)`,
  ).run({
    id,
    sender_id: input.senderId,
    content: input.content,
    matchId: input.matchId,
  });

  const row = db.prepare(`${selectMessage} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return mapRow(row, chatMessageSchema) ?? null;
};
