import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { config } from '@infra/config/env';

const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // Recommended size for GCM nonce
const AUTH_TAG_LENGTH_BYTES = 16;
export const CURRENT_SECRET_VERSION = 1;

type HexString = string;

export interface EncryptedSecret {
  version: number;
  cipherText: string; // base64 encoded ciphertext
  iv: string; // base64 encoded initialization vector
  authTag: string; // base64 encoded authentication tag
}

const key = config.security.twofa.encryptionKey;

if (key.length !== 32) {
  throw new Error('TWOFA_ENCRYPTION_KEY must decode to 32 bytes for AES-256-GCM.');
}

export const generateSecretKey = (): HexString => {
  return randomBytes(32).toString('hex');
};

export const encryptSecret = (plaintext: string): EncryptedSecret => {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH_BYTES,
  });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    version: CURRENT_SECRET_VERSION,
    cipherText: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
};

export const decryptSecret = (payload: EncryptedSecret): string => {
  if (payload.version !== CURRENT_SECRET_VERSION) {
    throw new Error(`Unsupported secret version: ${payload.version}`);
  }

  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');
  const decipher = createDecipheriv(AES_ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH_BYTES,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.cipherText, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
};
