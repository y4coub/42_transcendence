-- TOTP 2FA schema for secrets, recovery codes, trusted devices, and challenges.
BEGIN;

CREATE TABLE user_twofa_settings (
  user_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('disabled', 'pending', 'active')),
  secret_cipher TEXT,
  secret_iv TEXT,
  secret_tag TEXT,
  secret_version INTEGER NOT NULL DEFAULT 1,
  recovery_codes_created_at TEXT,
  last_verified_at TEXT,
  pending_expires_at INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE user_twofa_recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  used_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_twofa_recovery_codes_user ON user_twofa_recovery_codes(user_id);
CREATE INDEX idx_twofa_recovery_codes_used ON user_twofa_recovery_codes(user_id, used_at);

CREATE TABLE user_twofa_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'login',
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_twofa_challenges_token ON user_twofa_challenges(token_hash);
CREATE INDEX idx_twofa_challenges_user ON user_twofa_challenges(user_id);
CREATE INDEX idx_twofa_challenges_expires ON user_twofa_challenges(expires_at);

CREATE TABLE user_twofa_trusted_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  device_name TEXT,
  user_agent TEXT,
  ip_address TEXT,
  issued_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_twofa_trusted_devices_token ON user_twofa_trusted_devices(token_hash);
CREATE INDEX idx_twofa_trusted_devices_user ON user_twofa_trusted_devices(user_id);
CREATE INDEX idx_twofa_trusted_devices_expires ON user_twofa_trusted_devices(expires_at);

COMMIT;
