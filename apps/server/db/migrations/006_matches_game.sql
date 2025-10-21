-- Migration: 006_matches_game.sql
-- Feature: Real-Time Pong Game Integration (002-pong-game-integration)
-- Date: 2025-10-18
-- Description: Create matches table for standalone Pong games, add user stats tracking, and match chat support

-- Create matches table for standalone game matches (separate from tournament_matches)
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  tournamentId TEXT,
  p1Id TEXT NOT NULL,
  p2Id TEXT NOT NULL,
  p1Score INTEGER NOT NULL DEFAULT 0,
  p2Score INTEGER NOT NULL DEFAULT 0,
  winnerId TEXT,
  state TEXT NOT NULL DEFAULT 'waiting',
  pausedBy TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  startedAt TEXT,
  endedAt TEXT,
  FOREIGN KEY (tournamentId) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (p1Id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (p2Id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (winnerId) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (pausedBy) REFERENCES users(id) ON DELETE SET NULL,
  CHECK (p1Id != p2Id),
  CHECK (p1Score >= 0 AND p2Score >= 0),
  CHECK (p1Score <= 11 AND p2Score <= 11),
  CHECK (state IN ('waiting', 'countdown', 'playing', 'paused', 'ended', 'forfeited'))
);

-- Create indexes for matches table
CREATE INDEX IF NOT EXISTS idx_matches_p1 ON matches(p1Id);
CREATE INDEX IF NOT EXISTS idx_matches_p2 ON matches(p2Id);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournamentId) WHERE tournamentId IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matches_state ON matches(state) WHERE state NOT IN ('ended', 'forfeited');
CREATE INDEX IF NOT EXISTS idx_matches_paused_by ON matches(pausedBy);

-- Add win/loss tracking to users
ALTER TABLE users ADD COLUMN totalWins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN totalLosses INTEGER NOT NULL DEFAULT 0;

-- Add match chat support
ALTER TABLE chat_messages ADD COLUMN matchId TEXT;
CREATE INDEX IF NOT EXISTS idx_chat_messages_match ON chat_messages(matchId) WHERE matchId IS NOT NULL;

-- Validation triggers for matches table
CREATE TRIGGER IF NOT EXISTS validate_match_state
BEFORE UPDATE ON matches
FOR EACH ROW
WHEN NEW.state NOT IN ('waiting', 'countdown', 'playing', 'paused', 'ended', 'forfeited')
BEGIN
  SELECT RAISE(ABORT, 'Invalid match state');
END;

CREATE TRIGGER IF NOT EXISTS validate_match_scores
BEFORE UPDATE ON matches
FOR EACH ROW
WHEN NEW.p1Score < 0 OR NEW.p2Score < 0 OR NEW.p1Score > 11 OR NEW.p2Score > 11
BEGIN
  SELECT RAISE(ABORT, 'Invalid match scores');
END;

CREATE TRIGGER IF NOT EXISTS validate_match_pauser
BEFORE UPDATE ON matches
FOR EACH ROW
WHEN NEW.pausedBy IS NOT NULL AND NEW.pausedBy NOT IN (NEW.p1Id, NEW.p2Id)
BEGIN
  SELECT RAISE(ABORT, 'Pauser must be a player in the match');
END;

-- Update user stats on match completion
CREATE TRIGGER IF NOT EXISTS update_user_stats_on_match_end
AFTER UPDATE ON matches
FOR EACH ROW
WHEN OLD.state != 'ended' AND NEW.state = 'ended' AND NEW.winnerId IS NOT NULL
BEGIN
  -- Increment winner's totalWins
  UPDATE users SET totalWins = totalWins + 1 WHERE id = NEW.winnerId;
  
  -- Increment loser's totalLosses
  UPDATE users 
  SET totalLosses = totalLosses + 1 
  WHERE id = CASE 
    WHEN NEW.winnerId = NEW.p1Id THEN NEW.p2Id 
    ELSE NEW.p1Id 
  END;
END;
