import argon2 from 'argon2';

import { config } from '@infra/config/env';
import { createModuleLogger } from '@infra/observability/logger';

const log = createModuleLogger('auth:crypto');

const normalize = (code: string): string => {
  return code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
};

const ensureNonEmpty = (code: string): string => {
  const normalized = normalize(code);

  if (!normalized) {
    throw new Error('Recovery code must contain at least one alphanumeric character.');
  }

  return normalized;
};

const argonConfig = {
  type: argon2.argon2id,
  memoryCost: config.security.argon2.memoryCost,
  timeCost: config.security.argon2.timeCost,
};

export const hashRecoveryCode = async (code: string): Promise<string> => {
  const normalized = ensureNonEmpty(code);
  return argon2.hash(normalized, argonConfig);
};

export const verifyRecoveryCode = async (hash: string, candidate: string): Promise<boolean> => {
  const normalized = ensureNonEmpty(candidate);

  try {
    return await argon2.verify(hash, normalized);
  } catch (error) {
    log.warn({ err: error }, 'Failed to verify recovery code');
    return false;
  }
};

export const normalizeRecoveryCode = normalize;
