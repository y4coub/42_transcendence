import { randomBytes } from 'node:crypto';

import argon2 from 'argon2';
import QRCode from 'qrcode';
import { authenticator } from 'otplib';

import { normalizeRecoveryCode, hashRecoveryCode, verifyRecoveryCode } from '@auth/crypto';
import {
  type UserRecord,
  type TwoFactorSettingsRecord,
  type TwoFactorStatus,
  getTwoFactorSettings,
  upsertTwoFactorSettings,
  deleteTwoFactorRecoveryCodesForUser,
  replaceTwoFactorRecoveryCodes,
  deleteTwoFactorChallengesForUser,
  createTwoFactorChallenge,
  getTwoFactorChallengeById,
  markTwoFactorChallengeConsumed,
  deleteTrustedDevicesForUser,
  listTwoFactorRecoveryCodes,
  markTwoFactorRecoveryCodeUsed,
  updateUser,
} from '@auth/repository';
import { config } from '@infra/config/env';
import { createAuditLogger } from '@infra/observability/logger';
import { decryptSecret, encryptSecret, type EncryptedSecret } from '@security/crypto';
import {
  issueTrustedDeviceToken,
  type TrustedDeviceIssueResult,
  type TrustedDeviceMetadata,
} from './trusted-device';

authenticator.options = {
  step: 30,
  window: 1,
};

const log = createAuditLogger('twofa', { module: 'auth:twofa' });

const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECOVERY_CODE_LENGTH = 12;
const RECOVERY_CODE_GROUP = 4;
const CHALLENGE_TOKEN_BYTES = 32;

const argonOptions = {
  type: argon2.argon2id,
  memoryCost: config.security.argon2.memoryCost,
  timeCost: config.security.argon2.timeCost,
};

export interface EnrollmentStartResult {
  status: TwoFactorStatus;
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
  recoveryCodes: string[];
  expiresAt: number;
}

export interface TwoFactorStatusSummary {
  status: TwoFactorStatus;
  pendingExpiresAt: number | null;
  lastVerifiedAt: string | null;
  recoveryCodesCreatedAt: string | null;
}

const formatRecoveryCode = (raw: string): string => {
  const segments: string[] = [];
  for (let i = 0; i < raw.length; i += RECOVERY_CODE_GROUP) {
    segments.push(raw.slice(i, i + RECOVERY_CODE_GROUP));
  }
  return segments.join('-');
};

const generateRecoveryCode = (): string => {
  const bytes = randomBytes(RECOVERY_CODE_LENGTH);
  const chars = Array.from(bytes).map((byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]);
  return formatRecoveryCode(chars.join(''));
};

const generateRecoveryCodes = (count: number): string[] => {
  const codes = new Set<string>();
  while (codes.size < count) {
    codes.add(generateRecoveryCode());
  }
  return Array.from(codes);
};

const loadEncryptedSecret = (settings: TwoFactorSettingsRecord): EncryptedSecret => {
  if (!settings.secretCipher || !settings.secretIv || !settings.secretTag) {
    throw new Error('Two-factor secret is not set.');
  }

  return {
    version: settings.secretVersion,
    cipherText: settings.secretCipher,
    iv: settings.secretIv,
    authTag: settings.secretTag,
  };
};

const buildOtpAuthLabel = (user: UserRecord): string => {
  if (user.email) {
    return `${user.displayName} (${user.email})`;
  }

  return `${user.displayName} (${user.id})`;
};

const buildOtpAuthUrl = (user: UserRecord, secret: string): string => {
  const label = buildOtpAuthLabel(user);
  return authenticator.keyuri(label, 'ft-transcendence', secret);
};

const enrollmentExpiry = () => Date.now() + config.security.twofa.challengeTtlSeconds * 1000;

const resetTwoFactorState = (userId: string): TwoFactorSettingsRecord => {
  deleteTwoFactorRecoveryCodesForUser(userId);
  deleteTwoFactorChallengesForUser(userId);
  deleteTrustedDevicesForUser(userId);

  const settings = upsertTwoFactorSettings(userId, {
    status: 'disabled',
    secret: null,
    recoveryCodesCreatedAt: null,
    lastVerifiedAt: null,
    pendingExpiresAt: null,
  });

  updateUser(userId, { twofaSecret: null });
  return settings;
};

const recordSuccessfulVerification = (userId: string) => {
  upsertTwoFactorSettings(userId, {
    lastVerifiedAt: new Date().toISOString(),
  });
};

const consumeRecoveryCode = async (userId: string, candidate: string): Promise<boolean> => {
  const available = listTwoFactorRecoveryCodes(userId).filter((entry) => entry.usedAt === null);

  for (const entry of available) {
    const matches = await verifyRecoveryCode(entry.codeHash, candidate).catch(() => false);
    if (!matches) {
      continue;
    }

    markTwoFactorRecoveryCodeUsed(userId, entry.id);
    log.info({ userId, recoveryCodeId: entry.id }, 'Consumed two-factor recovery code');
    return true;
  }

  return false;
};

export const getTwoFactorStatusSummary = (userId: string): TwoFactorStatusSummary => {
  const settings = getTwoFactorSettings(userId);

  if (!settings) {
    return {
      status: 'disabled',
      pendingExpiresAt: null,
      lastVerifiedAt: null,
      recoveryCodesCreatedAt: null,
    };
  }

  return {
    status: settings.status,
    pendingExpiresAt: settings.pendingExpiresAt,
    lastVerifiedAt: settings.lastVerifiedAt,
    recoveryCodesCreatedAt: settings.recoveryCodesCreatedAt,
  };
};

export const beginTwoFactorEnrollment = async (
  user: UserRecord,
): Promise<EnrollmentStartResult> => {
  const currentSettings = getTwoFactorSettings(user.id);
  if (currentSettings?.status === 'active') {
    throw new Error('Two-factor authentication already active.');
  }

  const secret = authenticator.generateSecret();
  const encrypted = encryptSecret(secret);
  const otpauthUrl = buildOtpAuthUrl(user, secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
  const recoveryCodes = generateRecoveryCodes(config.security.twofa.recoveryCodesCount);
  const hashedCodes = await Promise.all(recoveryCodes.map((code) => hashRecoveryCode(code)));

  replaceTwoFactorRecoveryCodes(
    user.id,
    hashedCodes.map((codeHash, index) => ({
      codeHash,
      label: `code-${index + 1}`,
    })),
  );

  const settings = upsertTwoFactorSettings(user.id, {
    status: 'pending',
    secret: encrypted,
    recoveryCodesCreatedAt: new Date().toISOString(),
    lastVerifiedAt: null,
    pendingExpiresAt: enrollmentExpiry(),
  });

  deleteTwoFactorChallengesForUser(user.id);
  deleteTrustedDevicesForUser(user.id);
  updateUser(user.id, { twofaSecret: 'pending' });

  log.info({ userId: user.id }, 'Started two-factor enrollment');

  return {
    status: settings.status,
    secret,
    otpauthUrl,
    qrCodeDataUrl,
    recoveryCodes,
    expiresAt: settings.pendingExpiresAt!,
  };
};

export const confirmTwoFactorEnrollment = async (
  userId: string,
  code: string,
): Promise<TwoFactorSettingsRecord> => {
  const settings = getTwoFactorSettings(userId);
  if (!settings || settings.status !== 'pending') {
    throw new Error('No pending enrollment found.');
  }

  if (settings.pendingExpiresAt && settings.pendingExpiresAt < Date.now()) {
    resetTwoFactorState(userId);
    throw new Error('Two-factor enrollment expired.');
  }

  const secret = decryptSecret(loadEncryptedSecret(settings));
  const sanitizedCode = normalizeRecoveryCode(code);

  if (!authenticator.check(sanitizedCode, secret)) {
    throw new Error('Invalid two-factor code.');
  }

  const updated = upsertTwoFactorSettings(userId, {
    status: 'active',
    secret: loadEncryptedSecret(settings),
    lastVerifiedAt: new Date().toISOString(),
    pendingExpiresAt: null,
  });

  updateUser(userId, { twofaSecret: 'active' });
  log.info({ userId }, 'Two-factor enrollment confirmed');
  return updated;
};

export const cancelTwoFactorEnrollment = (userId: string): TwoFactorSettingsRecord => {
  log.info({ userId }, 'Cancelling two-factor enrollment');
  return resetTwoFactorState(userId);
};

export const disableTwoFactor = (userId: string): TwoFactorSettingsRecord => {
  const settings = getTwoFactorSettings(userId);
  if (!settings || settings.status === 'disabled') {
    return settings ?? resetTwoFactorState(userId);
  }

  log.info({ userId }, 'Disabling two-factor authentication');
  return resetTwoFactorState(userId);
};

export const regenerateTwoFactorRecoveryCodes = async (
  userId: string,
): Promise<string[]> => {
  const settings = getTwoFactorSettings(userId);
  if (!settings || settings.status !== 'active') {
    throw new Error('Two-factor authentication must be active.');
  }

  const recoveryCodes = generateRecoveryCodes(config.security.twofa.recoveryCodesCount);
  const hashedCodes = await Promise.all(recoveryCodes.map((code) => hashRecoveryCode(code)));

  replaceTwoFactorRecoveryCodes(
    userId,
    hashedCodes.map((codeHash, index) => ({
      codeHash,
      label: `code-${index + 1}`,
    })),
  );

  upsertTwoFactorSettings(userId, {
    recoveryCodesCreatedAt: new Date().toISOString(),
  });

  log.info({ userId }, 'Regenerated two-factor recovery codes');
  return recoveryCodes;
};

export const verifyTwoFactorCode = async (userId: string, rawCode: string): Promise<boolean> => {
  const settings = getTwoFactorSettings(userId);
  if (!settings || settings.status !== 'active') {
    return false;
  }

  const candidate = normalizeRecoveryCode(rawCode);

  try {
    const secret = decryptSecret(loadEncryptedSecret(settings));
    if (authenticator.check(candidate, secret)) {
      recordSuccessfulVerification(userId);
      return true;
    }
  } catch (error) {
    log.warn({ userId, err: error }, 'Failed to validate TOTP code');
  }

  const usedRecoveryCode = await consumeRecoveryCode(userId, candidate);
  if (usedRecoveryCode) {
    recordSuccessfulVerification(userId);
    return true;
  }

  return false;
};

const generateChallengeToken = () => randomBytes(CHALLENGE_TOKEN_BYTES).toString('base64url');

export interface IssueLoginChallengeResult {
  challengeId: string;
  challengeToken: string;
  expiresAt: number;
}

export const issueLoginChallenge = async (userId: string): Promise<IssueLoginChallengeResult> => {
  deleteTwoFactorChallengesForUser(userId);

  const token = generateChallengeToken();
  const tokenHash = await argon2.hash(token, argonOptions);
  const issuedAt = Date.now();
  const expiresAt = issuedAt + config.security.twofa.challengeTtlSeconds * 1000;

  const record = createTwoFactorChallenge({
    userId,
    tokenHash,
    purpose: 'login',
    issuedAt,
    expiresAt,
  });

  return {
    challengeId: record.id,
    challengeToken: token,
    expiresAt: record.expiresAt,
  };
};

export interface CompleteLoginChallengeOptions {
  challengeId: string;
  challengeToken: string;
  code: string;
  rememberDevice?: boolean;
  deviceMetadata?: TrustedDeviceMetadata;
}

export interface CompleteLoginChallengeResult {
  userId: string;
  trustedDevice?: TrustedDeviceIssueResult;
}

export const completeLoginChallenge = async (
  options: CompleteLoginChallengeOptions,
): Promise<CompleteLoginChallengeResult | undefined> => {
  const record = getTwoFactorChallengeById(options.challengeId);
  if (!record || record.purpose !== 'login') {
    return undefined;
  }

  if (record.expiresAt <= Date.now()) {
    deleteTwoFactorChallengesForUser(record.userId);
    return undefined;
  }

  if (record.consumedAt) {
    return undefined;
  }

  const tokenMatches = await argon2.verify(record.tokenHash, options.challengeToken).catch(() => false);
  if (!tokenMatches) {
    return undefined;
  }

  const verified = await verifyTwoFactorCode(record.userId, options.code);
  if (!verified) {
    return undefined;
  }

  markTwoFactorChallengeConsumed(record.id);
  deleteTwoFactorChallengesForUser(record.userId);

  let trustedDevice: TrustedDeviceIssueResult | undefined;
  if (options.rememberDevice) {
    trustedDevice = await issueTrustedDeviceToken(record.userId, options.deviceMetadata);
  }

  return {
    userId: record.userId,
    trustedDevice,
  };
};
