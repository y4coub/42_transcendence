import { randomUUID } from 'node:crypto';

import { getDatabase } from '@infra/db/client';
import { CURRENT_SECRET_VERSION, type EncryptedSecret } from '@security/crypto';

export type AuthProvider = 'local' | '42';

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  passHash: string | null;
  avatarUrl: string | null;
  provider: AuthProvider;
  providerSub: string | null;
  twofaSecret: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  email: string;
  displayName: string;
  passHash?: string | null;
  avatarUrl?: string | null;
  provider: AuthProvider;
  providerSub?: string | null;
  twofaSecret?: string | null;
}

export interface UpdateUserInput {
  email?: string;
  displayName?: string;
  passHash?: string | null;
  avatarUrl?: string | null;
  provider?: AuthProvider;
  providerSub?: string | null;
  twofaSecret?: string | null;
}

export type TwoFactorStatus = 'disabled' | 'pending' | 'active';

export interface TwoFactorSettingsRecord {
  userId: string;
  status: TwoFactorStatus;
  secretCipher: string | null;
  secretIv: string | null;
  secretTag: string | null;
  secretVersion: number;
  recoveryCodesCreatedAt: string | null;
  lastVerifiedAt: string | null;
  pendingExpiresAt: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateTwoFactorSettingsInput {
  status?: TwoFactorStatus;
  secret?: EncryptedSecret | null;
  recoveryCodesCreatedAt?: string | null;
  lastVerifiedAt?: string | null;
  pendingExpiresAt?: number | null;
}

export interface TwoFactorRecoveryCodeRecord {
  id: string;
  userId: string;
  codeHash: string;
  label: string | null;
  createdAt: string;
  usedAt: string | null;
}

export type TwoFactorChallengePurpose = 'login' | 'recovery';

export interface TwoFactorChallengeRecord {
  id: string;
  userId: string;
  tokenHash: string;
  purpose: TwoFactorChallengePurpose;
  issuedAt: number;
  expiresAt: number;
  consumedAt: number | null;
  createdAt: string;
}

export interface CreateTwoFactorChallengeInput {
  id?: string;
  userId: string;
  tokenHash: string;
  purpose: TwoFactorChallengePurpose;
  issuedAt: number;
  expiresAt: number;
}

export interface TwoFactorTrustedDeviceRecord {
  id: string;
  userId: string;
  tokenHash: string;
  deviceName: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  issuedAt: number;
  lastUsedAt: number;
  expiresAt: number;
  revokedAt: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTrustedDeviceInput {
  id?: string;
  userId: string;
  tokenHash: string;
  deviceName?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  issuedAt: number;
  lastUsedAt: number;
  expiresAt: number;
}

export interface UpdateTrustedDeviceUsageInput {
  id: string;
  lastUsedAt: number;
  userAgent?: string | null;
  ipAddress?: string | null;
}

const userSelect = `
  SELECT
    id,
    email,
    display_name AS displayName,
    pass_hash AS passHash,
    avatar_url AS avatarUrl,
    provider,
    provider_sub AS providerSub,
    twofa_secret AS twofaSecret,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM users
`;

const mapUserRow = (row: Record<string, unknown> | undefined): UserRecord | undefined => {
  if (!row) {
    return undefined;
  }

  return {
    id: row.id as string,
    email: row.email as string,
    displayName: row.displayName as string,
    passHash: (row.passHash as string | null) ?? null,
    avatarUrl: (row.avatarUrl as string | null) ?? null,
    provider: row.provider as AuthProvider,
    providerSub: (row.providerSub as string | null) ?? null,
    twofaSecret: (row.twofaSecret as string | null) ?? null,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
  };
};

export const createUser = (input: CreateUserInput): UserRecord => {
  const db = getDatabase();
  const id = randomUUID();
  const timestamp = new Date().toISOString();

  db.prepare(
    `INSERT INTO users (
      id,
      email,
      display_name,
      pass_hash,
      avatar_url,
      provider,
      provider_sub,
      twofa_secret,
      created_at,
      updated_at
    ) VALUES (
      @id,
      @email,
      @display_name,
      @pass_hash,
      @avatar_url,
      @provider,
      @provider_sub,
      @twofa_secret,
      @created_at,
      @updated_at
    )`,
  ).run({
    id,
    email: input.email,
    display_name: input.displayName,
    pass_hash: input.passHash ?? null,
    avatar_url: input.avatarUrl ?? null,
    provider: input.provider,
    provider_sub: input.providerSub ?? null,
    twofa_secret: input.twofaSecret ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  });

  return getUserById(id)!;
};

export const getUserById = (id: string): UserRecord | undefined => {
  const db = getDatabase();
  const row = db.prepare(`${userSelect} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return mapUserRow(row);
};

export const getUserByEmail = (email: string): UserRecord | undefined => {
  const db = getDatabase();
  const row = db.prepare(`${userSelect} WHERE email = ?`).get(email) as Record<string, unknown> | undefined;
  return mapUserRow(row);
};

export const getUserByProviderSub = (
  provider: AuthProvider,
  providerSub: string,
): UserRecord | undefined => {
  const db = getDatabase();
  const row = db
    .prepare(`${userSelect} WHERE provider = @provider AND provider_sub = @providerSub`)
    .get({ provider, providerSub }) as Record<string, unknown> | undefined;

  return mapUserRow(row);
};

export const updateUser = (id: string, updates: UpdateUserInput): UserRecord | undefined => {
  const db = getDatabase();
  const fields: string[] = [];
  const params: Record<string, unknown> = { id, updated_at: new Date().toISOString() };

  if (updates.email !== undefined) {
    fields.push('email = @email');
    params.email = updates.email;
  }

  if (updates.displayName !== undefined) {
    fields.push('display_name = @display_name');
    params.display_name = updates.displayName;
  }

  if (updates.passHash !== undefined) {
    fields.push('pass_hash = @pass_hash');
    params.pass_hash = updates.passHash ?? null;
  }

  if (updates.avatarUrl !== undefined) {
    fields.push('avatar_url = @avatar_url');
    params.avatar_url = updates.avatarUrl ?? null;
  }

  if (updates.provider !== undefined) {
    fields.push('provider = @provider');
    params.provider = updates.provider;
  }

  if (updates.providerSub !== undefined) {
    fields.push('provider_sub = @provider_sub');
    params.provider_sub = updates.providerSub ?? null;
  }

  if (updates.twofaSecret !== undefined) {
    fields.push('twofa_secret = @twofa_secret');
    params.twofa_secret = updates.twofaSecret ?? null;
  }

  if (fields.length === 0) {
    return getUserById(id);
  }

  fields.push('updated_at = @updated_at');
  const assignment = fields.join(', ');

  db.prepare(`UPDATE users SET ${assignment} WHERE id = @id`).run(params);

  return getUserById(id);
};

export interface SessionRecord {
  id: string;
  userId: string;
  refreshTokenHash: string;
  issuedAt: number;
  expiresAt: number;
  revokedAt: number | null;
  createdAt: string;
}

export interface CreateSessionInput {
  id?: string;
  userId: string;
  refreshTokenHash: string;
  issuedAt: number;
  expiresAt: number;
}

const sessionSelect = `
  SELECT
    id,
    user_id AS userId,
    refresh_token_hash AS refreshTokenHash,
    issued_at AS issuedAt,
    expires_at AS expiresAt,
    revoked_at AS revokedAt,
    created_at AS createdAt
  FROM sessions
`;

const mapSessionRow = (row: Record<string, unknown> | undefined): SessionRecord | undefined => {
  if (!row) {
    return undefined;
  }

  return {
    id: row.id as string,
    userId: row.userId as string,
    refreshTokenHash: row.refreshTokenHash as string,
    issuedAt: Number(row.issuedAt),
    expiresAt: Number(row.expiresAt),
    revokedAt: row.revokedAt !== null && row.revokedAt !== undefined ? Number(row.revokedAt) : null,
    createdAt: row.createdAt as string,
  };
};

export const createSession = (input: CreateSessionInput): SessionRecord => {
  const db = getDatabase();
  const id = input.id ?? randomUUID();

  db.prepare(
    `INSERT INTO sessions (
      id,
      user_id,
      refresh_token_hash,
      issued_at,
      expires_at
    ) VALUES (
      @id,
      @user_id,
      @refresh_token_hash,
      @issued_at,
      @expires_at
    )`,
  ).run({
    id,
    user_id: input.userId,
    refresh_token_hash: input.refreshTokenHash,
    issued_at: input.issuedAt,
    expires_at: input.expiresAt,
  });

  return getSessionById(id)!;
};

export const getSessionById = (id: string): SessionRecord | undefined => {
  const db = getDatabase();
  const row = db.prepare(`${sessionSelect} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return mapSessionRow(row);
};

export const getSessionByRefreshHash = (hash: string): SessionRecord | undefined => {
  const db = getDatabase();
  const row = db
    .prepare(`${sessionSelect} WHERE refresh_token_hash = ?`)
    .get(hash) as Record<string, unknown> | undefined;
  return mapSessionRow(row);
};

export const revokeSessionById = (id: string, revokedAt: number = Date.now()): void => {
  const db = getDatabase();
  db.prepare(`UPDATE sessions SET revoked_at = @revoked_at WHERE id = @id`).run({
    id,
    revoked_at: revokedAt,
  });
};

export const deleteSessionById = (id: string): number => {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  return result.changes ?? 0;
};

export const deleteSessionsForUser = (userId: string, excludeSessionId?: string): number => {
  const db = getDatabase();
  if (excludeSessionId) {
    const result = db
      .prepare('DELETE FROM sessions WHERE user_id = @userId AND id != @excludeId')
      .run({ userId, excludeId: excludeSessionId });
    return result.changes ?? 0;
  }

  const result = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  return result.changes ?? 0;
};

export const deleteExpiredSessions = (referenceTime: number = Date.now()): number => {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(referenceTime);
  return result.changes ?? 0;
};

const twoFactorSettingsSelect = `
  SELECT
    user_id AS userId,
    status,
    secret_cipher AS secretCipher,
    secret_iv AS secretIv,
    secret_tag AS secretTag,
    secret_version AS secretVersion,
    recovery_codes_created_at AS recoveryCodesCreatedAt,
    last_verified_at AS lastVerifiedAt,
    pending_expires_at AS pendingExpiresAt,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM user_twofa_settings
`;

const mapTwoFactorSettingsRow = (
  row: Record<string, unknown> | undefined,
): TwoFactorSettingsRecord | undefined => {
  if (!row) {
    return undefined;
  }

  return {
    userId: row.userId as string,
    status: row.status as TwoFactorStatus,
    secretCipher: (row.secretCipher as string | null) ?? null,
    secretIv: (row.secretIv as string | null) ?? null,
    secretTag: (row.secretTag as string | null) ?? null,
    secretVersion: row.secretVersion !== undefined && row.secretVersion !== null
      ? Number(row.secretVersion)
      : CURRENT_SECRET_VERSION,
    recoveryCodesCreatedAt: (row.recoveryCodesCreatedAt as string | null) ?? null,
    lastVerifiedAt: (row.lastVerifiedAt as string | null) ?? null,
    pendingExpiresAt:
      row.pendingExpiresAt !== undefined && row.pendingExpiresAt !== null
        ? Number(row.pendingExpiresAt)
        : null,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
  };
};

export const getTwoFactorSettings = (userId: string): TwoFactorSettingsRecord | undefined => {
  const db = getDatabase();
  const row = db
    .prepare(`${twoFactorSettingsSelect} WHERE user_id = ?`)
    .get(userId) as Record<string, unknown> | undefined;
  return mapTwoFactorSettingsRow(row);
};

export const listExpiredPendingTwoFactorEnrollments = (
  referenceTime: number = Date.now(),
): TwoFactorSettingsRecord[] => {
  const db = getDatabase();
  const rows = db
    .prepare(
      `${twoFactorSettingsSelect}
       WHERE status = 'pending'
         AND pending_expires_at IS NOT NULL
         AND pending_expires_at <= @ref`,
    )
    .all({ ref: referenceTime }) as Record<string, unknown>[];

  return rows
    .map((row) => mapTwoFactorSettingsRow(row))
    .filter((record): record is TwoFactorSettingsRecord => Boolean(record));
};

export const upsertTwoFactorSettings = (
  userId: string,
  updates: UpdateTwoFactorSettingsInput,
): TwoFactorSettingsRecord => {
  const db = getDatabase();
  const existing = getTwoFactorSettings(userId);

  const nextState = {
    status: existing?.status ?? 'disabled',
    secretCipher: existing?.secretCipher ?? null,
    secretIv: existing?.secretIv ?? null,
    secretTag: existing?.secretTag ?? null,
    secretVersion: existing?.secretVersion ?? CURRENT_SECRET_VERSION,
    recoveryCodesCreatedAt: existing?.recoveryCodesCreatedAt ?? null,
    lastVerifiedAt: existing?.lastVerifiedAt ?? null,
    pendingExpiresAt: existing?.pendingExpiresAt ?? null,
  };

  if (updates.status !== undefined) {
    nextState.status = updates.status;
  }

  if (updates.secret !== undefined) {
    if (updates.secret === null) {
      nextState.secretCipher = null;
      nextState.secretIv = null;
      nextState.secretTag = null;
      nextState.secretVersion = CURRENT_SECRET_VERSION;
    } else {
      nextState.secretCipher = updates.secret.cipherText;
      nextState.secretIv = updates.secret.iv;
      nextState.secretTag = updates.secret.authTag;
      nextState.secretVersion = updates.secret.version;
    }
  }

  if (updates.recoveryCodesCreatedAt !== undefined) {
    nextState.recoveryCodesCreatedAt = updates.recoveryCodesCreatedAt;
  }

  if (updates.lastVerifiedAt !== undefined) {
    nextState.lastVerifiedAt = updates.lastVerifiedAt;
  }

  if (updates.pendingExpiresAt !== undefined) {
    nextState.pendingExpiresAt = updates.pendingExpiresAt;
  }

  const timestamp = new Date().toISOString();
  const createdAt = existing?.createdAt ?? timestamp;

  db.prepare(
    `INSERT INTO user_twofa_settings (
      user_id,
      status,
      secret_cipher,
      secret_iv,
      secret_tag,
      secret_version,
      recovery_codes_created_at,
      last_verified_at,
      pending_expires_at,
      created_at,
      updated_at
    ) VALUES (
      @user_id,
      @status,
      @secret_cipher,
      @secret_iv,
      @secret_tag,
      @secret_version,
      @recovery_codes_created_at,
      @last_verified_at,
      @pending_expires_at,
      @created_at,
      @updated_at
    )
    ON CONFLICT(user_id) DO UPDATE SET
      status = excluded.status,
      secret_cipher = excluded.secret_cipher,
      secret_iv = excluded.secret_iv,
      secret_tag = excluded.secret_tag,
      secret_version = excluded.secret_version,
      recovery_codes_created_at = excluded.recovery_codes_created_at,
      last_verified_at = excluded.last_verified_at,
      pending_expires_at = excluded.pending_expires_at,
      updated_at = excluded.updated_at
  `,
  ).run({
    user_id: userId,
    status: nextState.status,
    secret_cipher: nextState.secretCipher,
    secret_iv: nextState.secretIv,
    secret_tag: nextState.secretTag,
    secret_version: nextState.secretVersion,
    recovery_codes_created_at: nextState.recoveryCodesCreatedAt,
    last_verified_at: nextState.lastVerifiedAt,
    pending_expires_at: nextState.pendingExpiresAt,
    created_at: createdAt,
    updated_at: timestamp,
  });

  return getTwoFactorSettings(userId)!;
};

export const deleteTwoFactorSettings = (userId: string): number => {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM user_twofa_settings WHERE user_id = ?').run(userId);
  return result.changes ?? 0;
};

export interface RecoveryCodeSeed {
  id?: string;
  codeHash: string;
  label?: string | null;
}

const twoFactorRecoveryCodeSelect = `
  SELECT
    id,
    user_id AS userId,
    code_hash AS codeHash,
    label,
    created_at AS createdAt,
    used_at AS usedAt
  FROM user_twofa_recovery_codes
`;

const mapTwoFactorRecoveryCodeRow = (
  row: Record<string, unknown> | undefined,
): TwoFactorRecoveryCodeRecord | undefined => {
  if (!row) {
    return undefined;
  }

  return {
    id: row.id as string,
    userId: row.userId as string,
    codeHash: row.codeHash as string,
    label: (row.label as string | null) ?? null,
    createdAt: row.createdAt as string,
    usedAt: (row.usedAt as string | null) ?? null,
  };
};

export const listTwoFactorRecoveryCodes = (userId: string): TwoFactorRecoveryCodeRecord[] => {
  const db = getDatabase();
  const rows = db
    .prepare(`${twoFactorRecoveryCodeSelect} WHERE user_id = ? ORDER BY created_at ASC`)
    .all(userId) as Record<string, unknown>[];
  return rows
    .map((row) => mapTwoFactorRecoveryCodeRow(row))
    .filter((record): record is TwoFactorRecoveryCodeRecord => Boolean(record));
};

export const getTwoFactorRecoveryCodeById = (
  id: string,
): TwoFactorRecoveryCodeRecord | undefined => {
  const db = getDatabase();
  const row = db.prepare(`${twoFactorRecoveryCodeSelect} WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return mapTwoFactorRecoveryCodeRow(row);
};

export const replaceTwoFactorRecoveryCodes = (
  userId: string,
  codes: RecoveryCodeSeed[],
): TwoFactorRecoveryCodeRecord[] => {
  const db = getDatabase();
  const insert = db.prepare(
    `INSERT INTO user_twofa_recovery_codes (
      id,
      user_id,
      code_hash,
      label,
      created_at
    ) VALUES (
      @id,
      @user_id,
      @code_hash,
      @label,
      @created_at
    )`,
  );

  const run = db.transaction(() => {
    db.prepare('DELETE FROM user_twofa_recovery_codes WHERE user_id = ?').run(userId);

    codes.forEach((code) => {
      insert.run({
        id: code.id ?? randomUUID(),
        user_id: userId,
        code_hash: code.codeHash,
        label: code.label ?? null,
        created_at: new Date().toISOString(),
      });
    });
  });

  run();

  return listTwoFactorRecoveryCodes(userId);
};

export const markTwoFactorRecoveryCodeUsed = (
  userId: string,
  codeId: string,
  usedAt: string = new Date().toISOString(),
): boolean => {
  const db = getDatabase();
  const result = db
    .prepare(
      `UPDATE user_twofa_recovery_codes
       SET used_at = @used_at
       WHERE id = @id AND user_id = @user_id AND used_at IS NULL`,
    )
    .run({
      id: codeId,
      user_id: userId,
      used_at: usedAt,
    });

  return (result.changes ?? 0) > 0;
};

export const deleteTwoFactorRecoveryCodesForUser = (userId: string): number => {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM user_twofa_recovery_codes WHERE user_id = ?').run(userId);
  return result.changes ?? 0;
};

const twoFactorChallengeSelect = `
  SELECT
    id,
    user_id AS userId,
    token_hash AS tokenHash,
    purpose,
    issued_at AS issuedAt,
    expires_at AS expiresAt,
    consumed_at AS consumedAt,
    created_at AS createdAt
  FROM user_twofa_challenges
`;

const mapTwoFactorChallengeRow = (
  row: Record<string, unknown> | undefined,
): TwoFactorChallengeRecord | undefined => {
  if (!row) {
    return undefined;
  }

  return {
    id: row.id as string,
    userId: row.userId as string,
    tokenHash: row.tokenHash as string,
    purpose: row.purpose as TwoFactorChallengePurpose,
    issuedAt: Number(row.issuedAt),
    expiresAt: Number(row.expiresAt),
    consumedAt:
      row.consumedAt !== undefined && row.consumedAt !== null ? Number(row.consumedAt) : null,
    createdAt: row.createdAt as string,
  };
};

export const createTwoFactorChallenge = (
  input: CreateTwoFactorChallengeInput,
): TwoFactorChallengeRecord => {
  const db = getDatabase();
  const id = input.id ?? randomUUID();

  db.prepare(
    `INSERT INTO user_twofa_challenges (
      id,
      user_id,
      token_hash,
      purpose,
      issued_at,
      expires_at
    ) VALUES (
      @id,
      @user_id,
      @token_hash,
      @purpose,
      @issued_at,
      @expires_at
    )`,
  ).run({
    id,
    user_id: input.userId,
    token_hash: input.tokenHash,
    purpose: input.purpose,
    issued_at: input.issuedAt,
    expires_at: input.expiresAt,
  });

  return getTwoFactorChallengeById(id)!;
};

export const getTwoFactorChallengeById = (
  id: string,
): TwoFactorChallengeRecord | undefined => {
  const db = getDatabase();
  const row = db.prepare(`${twoFactorChallengeSelect} WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return mapTwoFactorChallengeRow(row);
};

export const listActiveTwoFactorChallenges = (
  userId: string,
): TwoFactorChallengeRecord[] => {
  const db = getDatabase();
  const rows = db
    .prepare(
      `${twoFactorChallengeSelect}
       WHERE user_id = @user_id AND consumed_at IS NULL AND expires_at > @now
       ORDER BY issued_at DESC`,
    )
    .all({ user_id: userId, now: Date.now() }) as Record<string, unknown>[];

  return rows
    .map((row) => mapTwoFactorChallengeRow(row))
    .filter((record): record is TwoFactorChallengeRecord => Boolean(record));
};

export const markTwoFactorChallengeConsumed = (
  id: string,
  consumedAt: number = Date.now(),
): boolean => {
  const db = getDatabase();
  const result = db
    .prepare(
      `UPDATE user_twofa_challenges
       SET consumed_at = @consumed_at
       WHERE id = @id AND consumed_at IS NULL`,
    )
    .run({ id, consumed_at: consumedAt });

  return (result.changes ?? 0) > 0;
};

export const deleteTwoFactorChallenge = (id: string): number => {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM user_twofa_challenges WHERE id = ?').run(id);
  return result.changes ?? 0;
};

export const deleteTwoFactorChallengesForUser = (userId: string): number => {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM user_twofa_challenges WHERE user_id = ?').run(userId);
  return result.changes ?? 0;
};

export const deleteExpiredTwoFactorChallenges = (referenceTime: number = Date.now()): number => {
  const db = getDatabase();
  const result = db
    .prepare(
      `DELETE FROM user_twofa_challenges
       WHERE expires_at <= @ref OR (consumed_at IS NOT NULL AND consumed_at <= @ref)`,
    )
    .run({ ref: referenceTime });

  return result.changes ?? 0;
};

const trustedDeviceSelect = `
  SELECT
    id,
    user_id AS userId,
    token_hash AS tokenHash,
    device_name AS deviceName,
    user_agent AS userAgent,
    ip_address AS ipAddress,
    issued_at AS issuedAt,
    last_used_at AS lastUsedAt,
    expires_at AS expiresAt,
    revoked_at AS revokedAt,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM user_twofa_trusted_devices
`;

const mapTrustedDeviceRow = (
  row: Record<string, unknown> | undefined,
): TwoFactorTrustedDeviceRecord | undefined => {
  if (!row) {
    return undefined;
  }

  return {
    id: row.id as string,
    userId: row.userId as string,
    tokenHash: row.tokenHash as string,
    deviceName: (row.deviceName as string | null) ?? null,
    userAgent: (row.userAgent as string | null) ?? null,
    ipAddress: (row.ipAddress as string | null) ?? null,
    issuedAt: Number(row.issuedAt),
    lastUsedAt: Number(row.lastUsedAt),
    expiresAt: Number(row.expiresAt),
    revokedAt: row.revokedAt !== undefined && row.revokedAt !== null ? Number(row.revokedAt) : null,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
  };
};

export const createTrustedDevice = (
  input: CreateTrustedDeviceInput,
): TwoFactorTrustedDeviceRecord => {
  const db = getDatabase();
  const id = input.id ?? randomUUID();
  const timestamp = new Date().toISOString();

  db.prepare(
    `INSERT INTO user_twofa_trusted_devices (
      id,
      user_id,
      token_hash,
      device_name,
      user_agent,
      ip_address,
      issued_at,
      last_used_at,
      expires_at,
      created_at,
      updated_at
    ) VALUES (
      @id,
      @user_id,
      @token_hash,
      @device_name,
      @user_agent,
      @ip_address,
      @issued_at,
      @last_used_at,
      @expires_at,
      @created_at,
      @updated_at
    )`,
  ).run({
    id,
    user_id: input.userId,
    token_hash: input.tokenHash,
    device_name: input.deviceName ?? null,
    user_agent: input.userAgent ?? null,
    ip_address: input.ipAddress ?? null,
    issued_at: input.issuedAt,
    last_used_at: input.lastUsedAt,
    expires_at: input.expiresAt,
    created_at: timestamp,
    updated_at: timestamp,
  });

  return getTrustedDeviceById(id)!;
};

export const getTrustedDeviceById = (
  id: string,
): TwoFactorTrustedDeviceRecord | undefined => {
  const db = getDatabase();
  const row = db.prepare(`${trustedDeviceSelect} WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return mapTrustedDeviceRow(row);
};

export const listTrustedDevices = (userId: string): TwoFactorTrustedDeviceRecord[] => {
  const db = getDatabase();
  const rows = db
    .prepare(`${trustedDeviceSelect} WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId) as Record<string, unknown>[];
  return rows
    .map((row) => mapTrustedDeviceRow(row))
    .filter((record): record is TwoFactorTrustedDeviceRecord => Boolean(record));
};

export const countActiveTrustedDevices = (userId: string, referenceTime: number = Date.now()): number => {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT COUNT(1) as count
       FROM user_twofa_trusted_devices
       WHERE user_id = @user_id AND revoked_at IS NULL AND expires_at > @ref`,
    )
    .get({ user_id: userId, ref: referenceTime }) as { count: number } | undefined;

  return row ? Number(row.count) : 0;
};

export const updateTrustedDeviceUsage = (
  input: UpdateTrustedDeviceUsageInput,
): TwoFactorTrustedDeviceRecord | undefined => {
  const db = getDatabase();
  const assignments = ['last_used_at = @last_used_at', 'updated_at = @updated_at'];
  const params: Record<string, unknown> = {
    id: input.id,
    last_used_at: input.lastUsedAt,
    updated_at: new Date().toISOString(),
  };

  if (input.userAgent !== undefined) {
    assignments.push('user_agent = @user_agent');
    params.user_agent = input.userAgent ?? null;
  }

  if (input.ipAddress !== undefined) {
    assignments.push('ip_address = @ip_address');
    params.ip_address = input.ipAddress ?? null;
  }

  db.prepare(
    `UPDATE user_twofa_trusted_devices
     SET ${assignments.join(', ')}
     WHERE id = @id`,
  ).run(params);

  return getTrustedDeviceById(input.id);
};

export const revokeTrustedDevice = (
  id: string,
  revokedAt: number = Date.now(),
): TwoFactorTrustedDeviceRecord | undefined => {
  const db = getDatabase();
  db.prepare(
    `UPDATE user_twofa_trusted_devices
     SET revoked_at = @revoked_at, updated_at = @updated_at
     WHERE id = @id AND revoked_at IS NULL`,
  ).run({
    id,
    revoked_at: revokedAt,
    updated_at: new Date().toISOString(),
  });

  return getTrustedDeviceById(id);
};

export const deleteTrustedDevice = (id: string): number => {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM user_twofa_trusted_devices WHERE id = ?').run(id);
  return result.changes ?? 0;
};

export const deleteTrustedDevicesForUser = (userId: string): number => {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM user_twofa_trusted_devices WHERE user_id = ?').run(userId);
  return result.changes ?? 0;
};

export const deleteExpiredTrustedDevices = (referenceTime: number = Date.now()): number => {
  const db = getDatabase();
  const result = db
    .prepare(
      `DELETE FROM user_twofa_trusted_devices
       WHERE expires_at <= @ref OR (revoked_at IS NOT NULL AND revoked_at <= @ref)`,
    )
    .run({ ref: referenceTime });

  return result.changes ?? 0;
};
