import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { getUserById } from '@auth/repository';
import {
  beginTwoFactorEnrollment,
  cancelTwoFactorEnrollment,
  confirmTwoFactorEnrollment,
  disableTwoFactor,
  getTwoFactorStatusSummary,
  regenerateTwoFactorRecoveryCodes,
  verifyTwoFactorCode,
} from './service';
import {
  listTrustedDeviceViews,
  revokeTrustedDevice,
  revokeAllTrustedDevices,
  getActiveTrustedDeviceCount,
} from './trusted-device';

const twoFactorStatusSchema = z.object({
  status: z.enum(['disabled', 'pending', 'active']),
  pendingExpiresAt: z.number().nullable(),
  lastVerifiedAt: z.string().datetime().nullable(),
  recoveryCodesCreatedAt: z.string().datetime().nullable(),
});

const enrollmentStartResponseSchema = z.object({
  status: z.enum(['pending', 'active', 'disabled']),
  secret: z.string(),
  otpauthUrl: z.string(),
  qrCodeDataUrl: z.string(),
  recoveryCodes: z.array(z.string()),
  expiresAt: z.number(),
});

const regenerateRecoveryCodesResponseSchema = z.object({
  recoveryCodes: z.array(z.string()),
});

const trustedDeviceViewSchema = z.object({
  id: z.string().uuid(),
  deviceName: z.string().nullable(),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  lastUsedAt: z.number(),
  expiresAt: z.number(),
  revokedAt: z.number().nullable(),
});

const trustedDeviceListResponseSchema = z.object({
  devices: z.array(trustedDeviceViewSchema),
  totalActive: z.number().int().nonnegative(),
});

const twofaRoutes: FastifyPluginAsync = async (app) => {
  const router = app.withTypeProvider<ZodTypeProvider>();

  const ensureAuthenticated = async (request: FastifyRequest): Promise<string> => {
    try {
      await request.jwtVerify();
    } catch {
      throw app.httpErrors.unauthorized();
    }

    await app.verifyActiveSession(request);

    const userId = (request.user as { sub?: string } | undefined)?.sub;
    if (!userId) {
      throw app.httpErrors.unauthorized();
    }

    return userId;
  };

  router.get(
    '/auth/2fa/status',
    {
      schema: {
        response: {
          200: twoFactorStatusSchema,
        },
      },
    },
    async (request) => {
      const userId = await ensureAuthenticated(request);
      return getTwoFactorStatusSummary(userId);
    },
  );

  router.post(
    '/auth/2fa/enroll/start',
    {
      config: { rateLimit: { ...app.rateLimitProfiles.twoFactorEnrollment } },
      schema: {
        response: {
          200: enrollmentStartResponseSchema,
        },
      },
    },
    async (request) => {
      const userId = await ensureAuthenticated(request);
      const user = getUserById(userId);
      if (!user) {
        throw app.httpErrors.notFound('User not found');
      }

      try {
        return await beginTwoFactorEnrollment(user);
      } catch (error) {
        app.log.warn({ err: error, userId }, 'Failed to begin two-factor enrollment');
        throw app.httpErrors.badRequest((error as Error).message);
      }
    },
  );

  router.post(
    '/auth/2fa/enroll/confirm',
    {
      config: { rateLimit: { ...app.rateLimitProfiles.twoFactorVerification } },
      schema: {
        body: z.object({
          code: z.string().min(1),
        }),
        response: {
          200: twoFactorStatusSchema,
        },
      },
    },
    async (request) => {
      const userId = await ensureAuthenticated(request);

      try {
        await confirmTwoFactorEnrollment(userId, request.body.code);
        return getTwoFactorStatusSummary(userId);
      } catch (error) {
        app.log.warn({ err: error, userId }, 'Failed to confirm two-factor enrollment');
        throw app.httpErrors.badRequest((error as Error).message);
      }
    },
  );

  router.post(
    '/auth/2fa/enroll/cancel',
    {
      schema: {
        response: {
          200: twoFactorStatusSchema,
        },
      },
    },
    async (request) => {
      const userId = await ensureAuthenticated(request);
      cancelTwoFactorEnrollment(userId);
      return getTwoFactorStatusSummary(userId);
    },
  );

  router.post(
    '/auth/2fa/disable',
    {
      config: { rateLimit: { ...app.rateLimitProfiles.twoFactorVerification } },
      schema: {
        body: z.object({
          code: z.string().min(1).optional(),
        }),
        response: {
          200: twoFactorStatusSchema,
        },
      },
    },
    async (request) => {
      const userId = await ensureAuthenticated(request);
      const summary = getTwoFactorStatusSummary(userId);

      if (summary.status === 'active') {
        const providedCode = request.body.code;
        if (!providedCode) {
          throw app.httpErrors.badRequest('Two-factor code is required to disable 2FA.');
        }

        const verified = await verifyTwoFactorCode(userId, providedCode);
        if (!verified) {
          throw app.httpErrors.forbidden('Provided two-factor code is invalid.');
        }
      }

      disableTwoFactor(userId);
      return getTwoFactorStatusSummary(userId);
    },
  );

  router.post(
    '/auth/2fa/recovery/regenerate',
    {
      config: { rateLimit: { ...app.rateLimitProfiles.twoFactorVerification } },
      schema: {
        body: z.object({
          code: z.string().min(1),
        }),
        response: {
          200: regenerateRecoveryCodesResponseSchema,
        },
      },
    },
    async (request) => {
      const userId = await ensureAuthenticated(request);
      const verified = await verifyTwoFactorCode(userId, request.body.code);
      if (!verified) {
        throw app.httpErrors.forbidden('Provided two-factor code is invalid.');
      }

      const recoveryCodes = await regenerateTwoFactorRecoveryCodes(userId);
      return { recoveryCodes };
    },
  );

  router.get(
    '/auth/2fa/trusted-devices',
    {
      schema: {
        response: {
          200: trustedDeviceListResponseSchema,
        },
      },
    },
    async (request) => {
      const userId = await ensureAuthenticated(request);
      const devices = listTrustedDeviceViews(userId);
      const totalActive = getActiveTrustedDeviceCount(userId);
      return { devices, totalActive };
    },
  );

  router.delete(
    '/auth/2fa/trusted-devices/:deviceId',
    {
      schema: {
        params: z.object({
          deviceId: z.string().uuid(),
        }),
        response: {
          204: z.null(),
        },
      },
    },
    async (request, reply) => {
      const userId = await ensureAuthenticated(request);
      const success = revokeTrustedDevice(userId, request.params.deviceId);
      if (!success) {
        throw app.httpErrors.notFound('Trusted device not found');
      }

      return reply.code(204).send();
    },
  );

  router.post(
    '/auth/2fa/trusted-devices/revoke-all',
    {
      schema: {
        response: {
          200: z.object({ removed: z.number().int().nonnegative() }),
        },
      },
    },
    async (request) => {
      const userId = await ensureAuthenticated(request);
      const removed = revokeAllTrustedDevices(userId);
      return { removed };
    },
  );
};

export default fp(twofaRoutes, {
  name: 'auth-twofa-routes',
});
