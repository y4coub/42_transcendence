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
    throw new Error('Email already registered');
  }

  const passHash = await hashPassword(payload.password);
  const user = createUser({
    email: payload.email,
    displayName: payload.displayName,
    passHash,
    provider: 'local',
  });

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
  updateUser(userId, {
    provider: '42',
    providerSub,
    displayName: attributes.displayName,
    avatarUrl: attributes.avatarUrl ?? null,
  });
};

export const findOrCreateOauthUser = (
  providerSub: string,
  profile: { email: string; displayName: string; avatarUrl?: string | null },
): string => {
  const existingBySub = getUserByProviderSub('42', providerSub);
  if (existingBySub) {
    const updates: Record<string, string | null> = {};
    if (profile.displayName && profile.displayName !== existingBySub.displayName) {
      updates.displayName = profile.displayName;
    }
    if (profile.avatarUrl !== undefined && profile.avatarUrl !== existingBySub.avatarUrl) {
      updates.avatarUrl = profile.avatarUrl ?? null;
    }
    if (Object.keys(updates).length > 0) {
      updateUser(existingBySub.id, updates);
    }
    return existingBySub.id;
  }

  const existingByEmail = getUserByEmail(profile.email);
  if (existingByEmail) {
    updateUser(existingByEmail.id, {
      provider: '42',
      providerSub,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl ?? null,
    });
    return existingByEmail.id;
  }

  const user = createUser({
    email: profile.email,
    displayName: profile.displayName,
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
