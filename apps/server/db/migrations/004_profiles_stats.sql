-- Profile and stats schema additions.
BEGIN;

CREATE TABLE user_stats (
  user_id TEXT PRIMARY KEY,
  wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
  streak INTEGER NOT NULL DEFAULT 0,
  last_result TEXT CHECK (last_result IN ('win', 'loss')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE user_recent_matches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  opponent_user_id TEXT,
  match_id TEXT NOT NULL,
  p1_score INTEGER NOT NULL,
  p2_score INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('win', 'loss')),
  played_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (opponent_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (match_id) REFERENCES tournament_matches(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_stats_updated_at ON user_stats(updated_at DESC);
CREATE INDEX idx_user_recent_matches_user ON user_recent_matches(user_id, played_at DESC);
CREATE UNIQUE INDEX idx_user_recent_matches_user_match ON user_recent_matches(user_id, match_id);

COMMIT;
