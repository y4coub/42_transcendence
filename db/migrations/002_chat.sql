-- Chat messaging schema.
BEGIN;

CREATE TABLE chat_channels (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL COLLATE NOCASE,
  title TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_chat_channels_slug ON chat_channels(slug);
CREATE INDEX idx_chat_channels_creator ON chat_channels(created_by);

CREATE TABLE chat_memberships (
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (channel_id, user_id),
  FOREIGN KEY (channel_id) REFERENCES chat_channels(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_chat_memberships_user ON chat_memberships(user_id);
CREATE INDEX idx_chat_memberships_channel_role ON chat_memberships(channel_id, role);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('channel', 'dm')),
  dm_target_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (channel_id) REFERENCES chat_channels(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (dm_target_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK ((type = 'channel' AND channel_id IS NOT NULL AND dm_target_id IS NULL) OR (type = 'dm' AND channel_id IS NULL AND dm_target_id IS NOT NULL)),
  CHECK (length(content) <= 2000)
);

CREATE INDEX idx_chat_messages_channel_created_at ON chat_messages(channel_id, created_at);
CREATE INDEX idx_chat_messages_dm_pair ON chat_messages(sender_id, dm_target_id, created_at);
CREATE INDEX idx_chat_messages_dm_pair_reverse ON chat_messages(dm_target_id, sender_id, created_at);

CREATE TABLE chat_blocks (
  blocker_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (blocker_id, blocked_id),
  FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (blocker_id != blocked_id)
);

COMMIT;
