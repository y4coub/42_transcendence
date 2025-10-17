#!/usr/bin/env node
import { closeDatabase } from '@infra/db/client';
import { createModuleLogger } from '@infra/observability/logger';
import {
  listExpiredPendingTwoFactorEnrollments,
  deleteExpiredTwoFactorChallenges,
} from '@auth/repository';
import { cancelTwoFactorEnrollment } from './service';
import { cleanupTrustedDevices } from './trusted-device';

const log = createModuleLogger('auth:twofa-maintenance');

interface MaintenanceSummary {
  expiredEnrollments: number;
  removedChallenges: number;
  removedTrustedDevices: number;
}

const cleanupExpiredEnrollments = (referenceTime: number): number => {
  const expired = listExpiredPendingTwoFactorEnrollments(referenceTime);
  let cleaned = 0;

  for (const record of expired) {
    try {
      cancelTwoFactorEnrollment(record.userId);
      cleaned += 1;
      log.info({ userId: record.userId }, 'Cancelled expired two-factor enrollment');
    } catch (error) {
      log.error({ userId: record.userId, err: error }, 'Failed to cancel expired enrollment');
    }
  }

  return cleaned;
};

const runMaintenance = (referenceTime: number = Date.now()): MaintenanceSummary => {
  const expiredEnrollments = cleanupExpiredEnrollments(referenceTime);
  const removedChallenges = deleteExpiredTwoFactorChallenges(referenceTime);
  const removedTrustedDevices = cleanupTrustedDevices(referenceTime);

  return {
    expiredEnrollments,
    removedChallenges,
    removedTrustedDevices,
  };
};

const main = () => {
  const referenceTime = Date.now();
  log.info({ referenceTime }, 'Starting two-factor maintenance sweep');

  try {
    const summary = runMaintenance(referenceTime);
    log.info(summary, 'Two-factor maintenance sweep complete');
  } catch (error) {
    log.error({ err: error }, 'Two-factor maintenance sweep failed');
    process.exitCode = 1;
  } finally {
    closeDatabase();
  }
};

main();
