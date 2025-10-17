-- Tournament and matchmaking schema.
BEGIN;

CREATE TABLE tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT
);

CREATE INDEX idx_tournaments_status ON tournaments(status);
CREATE INDEX idx_tournaments_created_at ON tournaments(created_at);

CREATE TABLE tournament_players (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  user_id TEXT,
  queued_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tournament_id, alias COLLATE NOCASE),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_tournament_players_tournament ON tournament_players(tournament_id);
CREATE INDEX idx_tournament_players_queue ON tournament_players(tournament_id, queued_at);
CREATE INDEX idx_tournament_players_user ON tournament_players(user_id);

CREATE TABLE tournament_matches (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  p1_id TEXT NOT NULL,
  p2_id TEXT NOT NULL,
  order_idx INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'announced', 'completed')),
  winner_id TEXT,
  p1_score INTEGER,
  p2_score INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  announced_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (p1_id) REFERENCES tournament_players(id) ON DELETE CASCADE,
  FOREIGN KEY (p2_id) REFERENCES tournament_players(id) ON DELETE CASCADE,
  FOREIGN KEY (winner_id) REFERENCES tournament_players(id) ON DELETE SET NULL,
  CHECK (p1_id != p2_id)
);

CREATE UNIQUE INDEX idx_tournament_matches_order ON tournament_matches(tournament_id, order_idx);
CREATE INDEX idx_tournament_matches_status ON tournament_matches(tournament_id, status);
CREATE INDEX idx_tournament_matches_players ON tournament_matches(tournament_id, p1_id, p2_id);

COMMIT;
