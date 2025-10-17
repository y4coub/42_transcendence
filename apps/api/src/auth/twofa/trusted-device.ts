import { createHmac, randomBytes } from 'node:crypto';

import argon2 from 'argon2';

import {
  createTrustedDevice,
  updateTrustedDeviceUsage,
  getTrustedDeviceById,
  listTrustedDevices,
  deleteTrustedDevice,
  deleteTrustedDevicesForUser,
  deleteExpiredTrustedDevices,
  countActiveTrustedDevices,
  revokeTrustedDevice as revokeTrustedDeviceRecord,
  type TwoFactorTrustedDeviceRecord,
} from '@auth/repository';
import { config } from '@infra/config/env';
import { createAuditLogger } from '@infra/observability/logger';

const log = createAuditLogger('twofa', { module: 'auth:twofa-trusted' });

const TOKEN_SIZE_BYTES = 32;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const argonOptions = {
  type: argon2.argon2id,
  memoryCost: config.security.argon2.memoryCost,
  timeCost: config.security.argon2.timeCost,
};

export interface TrustedDeviceMetadata {
  deviceName?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface TrustedDeviceIssueResult {
  deviceId: string;
  token: string;
  expiresAt: number;
}

const buildToken = (userId: string): string => {
  const nonce = randomBytes(TOKEN_SIZE_BYTES).toString('base64url');
  const signature = createHmac('sha256', config.security.twofa.trustedDevices.secret)
    .update(`${userId}:${nonce}`)
    .digest('base64url');
  return `${nonce}.${signature}`;
};

const verifyTokenSignature = (userId: string, token: string): boolean => {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return false;
  }

  const [nonce, signature] = parts;
  const expected = createHmac('sha256', config.security.twofa.trustedDevices.secret)
    .update(`${userId}:${nonce}`)
    .digest('base64url');

  return expected === signature;
};

const enforceTrustedDeviceQuota = (userId: string) => {
  const maxDevices = config.security.twofa.trustedDevices.maxRemembered;
  if (maxDevices <= 0) {
    deleteTrustedDevicesForUser(userId);
    return;
  }

  const now = Date.now();
  const activeDevices = listTrustedDevices(userId)
    .filter((device) => !device.revokedAt && device.expiresAt > now)
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt);

  while (activeDevices.length >= maxDevices) {
    const oldest = activeDevices.shift();
    if (!oldest) {
      break;
    }
    deleteTrustedDevice(oldest.id);
    log.info({ userId, deviceId: oldest.id }, 'Removed trusted device to enforce quota');
  }
};

export const issueTrustedDeviceToken = async (
  userId: string,
  metadata: TrustedDeviceMetadata = {},
): Promise<TrustedDeviceIssueResult> => {
  deleteExpiredTrustedDevices();
  enforceTrustedDeviceQuota(userId);

  const token = buildToken(userId);
  const tokenHash = await argon2.hash(token, argonOptions);
  const now = Date.now();
  const expiresAt = now + config.security.twofa.trustedDevices.ttlDays * MILLISECONDS_PER_DAY;

  const record = createTrustedDevice({
    userId,
    tokenHash,
    deviceName: metadata.deviceName ?? null,
    userAgent: metadata.userAgent ?? null,
    ipAddress: metadata.ipAddress ?? null,
    issuedAt: now,
    lastUsedAt: now,
    expiresAt,
  });

  log.info({ userId, deviceId: record.id }, 'Issued trusted device token');

  return {
    deviceId: record.id,
    token,
    expiresAt: record.expiresAt,
  };
};

export const verifyTrustedDeviceToken = async (
  userId: string,
  deviceId: string,
  token: string,
  metadata: TrustedDeviceMetadata = {},
): Promise<TwoFactorTrustedDeviceRecord | undefined> => {
  const record = getTrustedDeviceById(deviceId);
  if (!record || record.userId !== userId) {
    return undefined;
  }

  if (record.revokedAt || record.expiresAt <= Date.now()) {
    return undefined;
  }

  if (!verifyTokenSignature(userId, token)) {
    return undefined;
  }

  const matches = await argon2.verify(record.tokenHash, token).catch(() => false);
  if (!matches) {
    return undefined;
  }

  updateTrustedDeviceUsage({
    id: record.id,
    lastUsedAt: Date.now(),
    userAgent: metadata.userAgent,
    ipAddress: metadata.ipAddress,
  });

  return getTrustedDeviceById(record.id);
};

export interface TrustedDeviceView {
  id: string;
  deviceName: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  lastUsedAt: number;
  expiresAt: number;
  revokedAt: number | null;
}

export const listTrustedDeviceViews = (userId: string): TrustedDeviceView[] => {
  return listTrustedDevices(userId).map((device) => ({
    id: device.id,
    deviceName: device.deviceName,
    userAgent: device.userAgent,
    ipAddress: device.ipAddress,
    lastUsedAt: device.lastUsedAt,
    expiresAt: device.expiresAt,
    revokedAt: device.revokedAt,
  }));
};

export const revokeTrustedDevice = (userId: string, deviceId: string): boolean => {
  const record = getTrustedDeviceById(deviceId);
  if (!record || record.userId !== userId) {
    return false;
  }

  const updated = revokeTrustedDeviceRecord(deviceId);
  if (updated && !updated.revokedAt) {
    return false;
  }

  log.info({ userId, deviceId }, 'Revoked trusted device');
  return true;
};

export const revokeAllTrustedDevices = (userId: string): number => {
  log.info({ userId }, 'Revoking all trusted devices for user');
  return deleteTrustedDevicesForUser(userId);
};

export const cleanupTrustedDevices = (referenceTime: number = Date.now()): number => {
  const removed = deleteExpiredTrustedDevices(referenceTime);
  if (removed > 0) {
    log.info({ removed }, 'Removed expired trusted devices');
  }
  return removed;
};

export const getActiveTrustedDeviceCount = (userId: string): number => {
  return countActiveTrustedDevices(userId);
};
