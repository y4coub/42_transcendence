-- Migration: 007_recent_matches_fk.sql
-- Purpose: Align user_recent_matches.match_id FK with new matches table

BEGIN TRANSACTION;

CREATE TABLE user_recent_matches__new (
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
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

INSERT INTO user_recent_matches__new (
  id,
  user_id,
  opponent_user_id,
  match_id,
  p1_score,
  p2_score,
  outcome,
  played_at,
  created_at
) SELECT
  id,
  user_id,
  opponent_user_id,
  match_id,
  p1_score,
  p2_score,
  outcome,
  played_at,
  created_at
FROM user_recent_matches;

DROP TABLE user_recent_matches;

ALTER TABLE user_recent_matches__new
  RENAME TO user_recent_matches;

CREATE INDEX idx_user_recent_matches_user
  ON user_recent_matches(user_id, played_at DESC);

CREATE UNIQUE INDEX idx_user_recent_matches_user_match
  ON user_recent_matches(user_id, match_id);

COMMIT;
