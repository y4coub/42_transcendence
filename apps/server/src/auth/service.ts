import { randomUUID } from 'node:crypto';

import argon2 from 'argon2';

import { config } from '@infra/config/env';
import { logger } from '@infra/observability/logger';
import { authTokensSchema, RegisterBody, LoginBody, RefreshTokenBody, CurrentUserResponse } from './schemas';
import {
  createSession,
  createUser,
  deleteSessionById,
  deleteSessionsForUser,
  deleteExpiredSessions,
  getSessionById,
  getUserByEmail,
  getUserById,
  getUserByProviderSub,
  getTwoFactorSettings,
  updateUser,
  isDisplayNameTaken,
  type UpdateUserInput,
} from './repository';
import {
  completeLoginChallenge,
  issueLoginChallenge,
} from './twofa/service';
import {
  verifyTrustedDeviceToken,
  type TrustedDeviceIssueResult,
} from './twofa/trusted-device';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthServiceDeps {
  signAccessToken: (payload: Record<string, unknown>) => Promise<string>;
  signRefreshToken: (payload: Record<string, unknown>) => Promise<string>;
  verifyAccessToken: (token: string) => Promise<unknown>;
  verifyRefreshToken: (token: string) => Promise<unknown>;
}

export interface TrustedDeviceAssertion {
  deviceId: string;
  token: string;
}

export interface LoginRequestContext {
  trustedDevice?: TrustedDeviceAssertion;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export type AuthenticationResult =
  | { type: 'tokens'; tokens: TokenPair }
  | { type: 'challenge'; challengeId: string; challengeToken: string; expiresAt: number };

export type RegistrationErrorCode = 'EMAIL_IN_USE' | 'DISPLAY_NAME_IN_USE';

export class RegistrationError extends Error {
  constructor(public readonly code: RegistrationErrorCode, message: string) {
    super(message);
    this.name = 'RegistrationError';
  }
}

const hashRefreshToken = async (token: string): Promise<string> => {
  return argon2.hash(token, {
    type: argon2.argon2id,
    memoryCost: config.security.argon2.memoryCost,
    timeCost: config.security.argon2.timeCost,
  });
};

const verifyPassword = async (hash: string | null, candidate: string): Promise<boolean> => {
  if (!hash) {
    return false;
  }

  try {
    return await argon2.verify(hash, candidate);
  } catch (error) {
    logger.warn({ err: error }, 'Password verification failed');
    return false;
  }
};

const hashPassword = async (password: string): Promise<string> => {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: config.security.argon2.memoryCost,
    timeCost: config.security.argon2.timeCost,
  });
};

const DISPLAY_NAME_MAX_LENGTH = 32;
const DISPLAY_NAME_SUFFIX_ATTEMPTS = 25;

const normalizeDisplayName = (value: string): string => {
  const decomposed = value.normalize('NFKD').replace(/[\u0300-\u036f]/gu, '');
  const sanitized = decomposed.replace(/[^A-Za-z0-9 _-]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  return sanitized;
};

const isDataUriAvatar = (value: string | null | undefined): boolean => {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith('data:image/');
};

const displayNamesEqual = (a: string, b: string): boolean =>
  normalizeDisplayName(a).toLocaleLowerCase() === normalizeDisplayName(b).toLocaleLowerCase();

const ensureUniqueDisplayName = (preferred: string, excludeUserId?: string): string => {
  const baseRaw = normalizeDisplayName(preferred);
  const base = baseRaw.length > 0 ? baseRaw.slice(0, DISPLAY_NAME_MAX_LENGTH) : 'Player';

  if (!isDisplayNameTaken(base, excludeUserId)) {
    return base;
  }

  for (let attempt = 0; attempt < DISPLAY_NAME_SUFFIX_ATTEMPTS; attempt += 1) {
    const suffix = `#${Math.floor(1000 + Math.random() * 9000)}`;
    const available = Math.max(DISPLAY_NAME_MAX_LENGTH - suffix.length, 1);
    const truncated = normalizeDisplayName(base).slice(0, available).replace(/\s+$/u, '');
    const candidate = `${truncated}${suffix}`;
    if (!isDisplayNameTaken(candidate, excludeUserId)) {
      return candidate;
    }
  }

  throw new Error('Unable to allocate unique display name');
};

const computeExpiry = (issuedAt: number, ttlSeconds: number) => issuedAt + ttlSeconds * 1000;

const finalizeAuthentication = async (
  deps: AuthServiceDeps,
  userId: string,
  context: LoginRequestContext = {},
): Promise<AuthenticationResult> => {
  const settings = getTwoFactorSettings(userId);

  if (!settings || settings.status !== 'active') {
    const tokens = await issueSession(deps, userId);
    return { type: 'tokens', tokens };
  }

  if (context.trustedDevice) {
    const trusted = await verifyTrustedDeviceToken(
      userId,
      context.trustedDevice.deviceId,
      context.trustedDevice.token,
      {
        userAgent: context.userAgent ?? undefined,
        ipAddress: context.ipAddress ?? undefined,
      },
    );

    if (trusted) {
      const tokens = await issueSession(deps, userId);
      return { type: 'tokens', tokens };
    }
  }

  const challenge = await issueLoginChallenge(userId);
  return {
    type: 'challenge',
    challengeId: challenge.challengeId,
    challengeToken: challenge.challengeToken,
    expiresAt: challenge.expiresAt,
  };
};

export const authenticateUser = async (
  deps: AuthServiceDeps,
  userId: string,
  context: LoginRequestContext = {},
): Promise<AuthenticationResult> => {
  return finalizeAuthentication(deps, userId, context);
};

const buildTokenPayload = (userId: string, sessionId: string) => ({
  sub: userId,
  sid: sessionId,
});

const decodeRefreshToken = async (
  deps: Pick<AuthServiceDeps, 'verifyRefreshToken'>,
  refreshToken: string,
): Promise<{ userId: string; sessionId: string } | undefined> => {
  try {
    const decoded = (await deps.verifyRefreshToken(refreshToken)) as {
      sub?: string;
      sid?: string;
    };

    if (!decoded.sub || !decoded.sid) {
      return undefined;
    }

    return { userId: decoded.sub, sessionId: decoded.sid };
  } catch (error) {
    logger.warn({ err: error }, 'Failed to decode refresh token');
    return undefined;
  }
};

export const registerLocalAccount = async (
  deps: AuthServiceDeps,
  payload: RegisterBody,
): Promise<TokenPair> => {
  const existing = getUserByEmail(payload.email);
  if (existing) {
    throw new RegistrationError('EMAIL_IN_USE', 'Email already registered');
  }

  const desiredDisplayName = normalizeDisplayName(payload.displayName);
  if (isDisplayNameTaken(desiredDisplayName)) {
    throw new RegistrationError('DISPLAY_NAME_IN_USE', 'Display name already in use');
  }

  const passHash = await hashPassword(payload.password);
  let user: ReturnType<typeof createUser>;
  try {
    user = createUser({
      email: payload.email,
      displayName: desiredDisplayName,
      passHash,
      provider: 'local',
    });
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed: users\.display_name/.test(error.message)) {
      throw new RegistrationError('DISPLAY_NAME_IN_USE', 'Display name already in use');
    }
    throw error;
  }

  return issueSession(deps, user.id);
};

export const loginWithPassword = async (
  deps: AuthServiceDeps,
  payload: LoginBody,
  context: LoginRequestContext = {},
): Promise<AuthenticationResult> => {
  const user = getUserByEmail(payload.email);
  if (!user) {
    throw new Error('Invalid credentials');
  }

  const valid = await verifyPassword(user.passHash, payload.password);
  if (!valid) {
    throw new Error('Invalid credentials');
  }

  return authenticateUser(deps, user.id, context);
};

export const refreshTokens = async (
  deps: AuthServiceDeps,
  payload: RefreshTokenBody,
): Promise<TokenPair> => {
  const decoded = await decodeRefreshToken(deps, payload.refreshToken);
  if (!decoded) {
    throw new Error('Invalid refresh token');
  }

  const session = getSessionById(decoded.sessionId);
  if (!session || session.revokedAt || session.expiresAt <= Date.now()) {
    throw new Error('Invalid refresh token');
  }

  const matches = await argon2.verify(session.refreshTokenHash, payload.refreshToken).catch(() => false);
  if (!matches) {
    throw new Error('Invalid refresh token');
  }

  deleteSessionById(session.id);

  return issueSession(deps, session.userId);
};

export const revokeSession = (sessionId: string): void => {
  deleteSessionById(sessionId);
};

export const revokeAllSessionsForUser = (userId: string, excludeSessionId?: string): number => {
  return deleteSessionsForUser(userId, excludeSessionId);
};

export const loadCurrentUser = (userId: string): CurrentUserResponse | undefined => {
  const user = getUserById(userId);
  if (!user) {
    return undefined;
  }

  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? undefined,
    bio: undefined,
    email: user.email,
    provider: user.provider,
  };
};

export const issueSession = async (deps: AuthServiceDeps, userId: string): Promise<TokenPair> => {
  const issuedAt = Date.now();
  const sessionId = randomUUID();

  const accessPayload = buildTokenPayload(userId, sessionId);
  const refreshRawPayload = buildTokenPayload(userId, sessionId);

  const [accessToken, refreshToken] = await Promise.all([
    deps.signAccessToken(accessPayload),
    deps.signRefreshToken(refreshRawPayload),
  ]);

  const refreshHash = await hashRefreshToken(refreshToken);

  createSession({
    id: sessionId,
    userId,
    refreshTokenHash: refreshHash,
    issuedAt,
    expiresAt: computeExpiry(issuedAt, config.security.jwt.refresh.ttlSeconds),
  });

  const tokens = {
    accessToken,
    refreshToken,
    expiresIn: config.security.jwt.access.ttlSeconds,
  } satisfies TokenPair;

  return authTokensSchema.parse(tokens);
};

export interface CompleteLoginChallengeInput {
  challengeId: string;
  challengeToken: string;
  code: string;
  rememberDevice?: boolean;
  deviceName?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface CompleteLoginChallengeOutcome {
  tokens: TokenPair;
  trustedDevice?: TrustedDeviceIssueResult;
}

export const completeTwoFactorLogin = async (
  deps: AuthServiceDeps,
  input: CompleteLoginChallengeInput,
): Promise<CompleteLoginChallengeOutcome> => {
  const result = await completeLoginChallenge({
    challengeId: input.challengeId,
    challengeToken: input.challengeToken,
    code: input.code,
    rememberDevice: input.rememberDevice,
    deviceMetadata: {
      deviceName: input.deviceName ?? undefined,
      userAgent: input.userAgent ?? undefined,
      ipAddress: input.ipAddress ?? undefined,
    },
  });

  if (!result) {
    throw new Error('Invalid or expired two-factor challenge.');
  }

  const tokens = await issueSession(deps, result.userId);

  return {
    tokens,
    trustedDevice: result.trustedDevice,
  };
};

export const rotatePasswordHash = async (userId: string, newPassword: string): Promise<void> => {
  const passHash = await hashPassword(newPassword);
  updateUser(userId, { passHash });
};

export const linkOauthProfile = (
  userId: string,
  providerSub: string,
  attributes: { displayName?: string; avatarUrl?: string | null },
): void => {
  const current = getUserById(userId);
  const updates: UpdateUserInput = {
    provider: '42',
    providerSub,
  };

  const nextDisplayName = attributes.displayName ? normalizeDisplayName(attributes.displayName) : '';
  if (nextDisplayName.length > 0) {
    if (current && !displayNamesEqual(nextDisplayName, current.displayName)) {
      updates.displayName = ensureUniqueDisplayName(nextDisplayName, userId);
    }
  }

  if (
    attributes.avatarUrl !== undefined &&
    !isDataUriAvatar(current?.avatarUrl ?? null)
  ) {
    updates.avatarUrl = attributes.avatarUrl ?? null;
  }

  updateUser(userId, updates);
};

export const findOrCreateOauthUser = (
  providerSub: string,
  profile: {
    email: string;
    displayName: string;
    username?: string;
    avatarUrl?: string | null;
    fullName?: string | null;
  },
): string => {
  const preferredDisplay = profile.username ?? profile.displayName;
  const fallbackDisplay = normalizeDisplayName(profile.displayName);
  const normalizedFullName = profile.fullName ? normalizeDisplayName(profile.fullName) : '';
  const normalizedPreferred = normalizeDisplayName(preferredDisplay);
  const emailPrefix = profile.email.includes('@') ? profile.email.split('@')[0] ?? '' : profile.email;
  const normalizedEmail = normalizeDisplayName(emailPrefix);

  const desiredDisplayName =
    normalizedPreferred ||
    fallbackDisplay ||
    normalizedFullName ||
    normalizedEmail ||
    'Player';

  const existingBySub = getUserByProviderSub('42', providerSub);
  if (existingBySub) {
    const updates: UpdateUserInput = {};
    if (desiredDisplayName.length > 0 && !displayNamesEqual(desiredDisplayName, existingBySub.displayName)) {
      updates.displayName = ensureUniqueDisplayName(desiredDisplayName, existingBySub.id);
    }
    if (
      profile.avatarUrl !== undefined &&
      profile.avatarUrl !== existingBySub.avatarUrl &&
      !isDataUriAvatar(existingBySub.avatarUrl)
    ) {
      updates.avatarUrl = profile.avatarUrl ?? null;
    }
    if (Object.keys(updates).length > 0) {
      updateUser(existingBySub.id, updates);
    }
    return existingBySub.id;
  }

  const existingByEmail = getUserByEmail(profile.email);
  if (existingByEmail) {
    const updates: UpdateUserInput = {
      provider: '42',
      providerSub,
    };

    if (desiredDisplayName.length > 0 && !displayNamesEqual(desiredDisplayName, existingByEmail.displayName)) {
      updates.displayName = ensureUniqueDisplayName(desiredDisplayName, existingByEmail.id);
    }

    if (
      profile.avatarUrl !== undefined &&
      profile.avatarUrl !== existingByEmail.avatarUrl &&
      !isDataUriAvatar(existingByEmail.avatarUrl)
    ) {
      updates.avatarUrl = profile.avatarUrl ?? null;
    }

    updateUser(existingByEmail.id, updates);
    return existingByEmail.id;
  }

  const user = createUser({
    email: profile.email,
    displayName: ensureUniqueDisplayName(desiredDisplayName),
    provider: '42',
    providerSub,
    avatarUrl: profile.avatarUrl ?? null,
    passHash: null,
  });

  return user.id;
};

export const purgeExpiredSessions = (referenceTime: number = Date.now()): number => {
  return deleteExpiredSessions(referenceTime);
};

export const extractSessionIdFromToken = async (
  deps: Pick<AuthServiceDeps, 'verifyAccessToken'>,
  token: string,
): Promise<string | undefined> => {
  try {
    const decoded = (await deps.verifyAccessToken(token)) as { sid?: string };
    return decoded.sid;
  } catch (error) {
    logger.warn({ err: error }, 'Failed to verify access token for session extraction');
    return undefined;
  }
};
