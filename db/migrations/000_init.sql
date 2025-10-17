-- Baseline schema migration.
-- Creates the schema_migrations ledger and seeds helper views used by subsequent migrations.
BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

COMMIT;
