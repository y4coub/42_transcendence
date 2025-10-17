import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ZodTypeProvider } from 'fastify-type-provider-zod';

import { config } from '@infra/config/env';
import {
  registerBodySchema,
  loginBodySchema,
  loginChallengeBodySchema,
  refreshTokenBodySchema,
  authTokensSchema,
  currentUserResponseSchema,
  oauth42StartQuerySchema,
  oauth42CallbackQuerySchema,
  twoFactorChallengeResponseSchema,
  trustedDeviceIssueSchema,
} from './schemas';
import {
  registerLocalAccount,
  loginWithPassword,
  refreshTokens,
  revokeSession,
  loadCurrentUser,
  authenticateUser,
  findOrCreateOauthUser,
  AuthServiceDeps,
  extractSessionIdFromToken,
  completeTwoFactorLogin,
} from './service';
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  fetchProfile,
} from './oauth42';

const STATE_TTL_MS = 5 * 60 * 1000; // 5 minutes for OAuth state validity

interface OAuthStatePayload {
  nonce: string;
  codeVerifier: string;
  expiresAt: number;
  redirectUri?: string;
}

const loginChallengeSuccessSchema = authTokensSchema.extend({
  trustedDevice: trustedDeviceIssueSchema.optional(),
});

const createCodeVerifier = () => randomBytes(32).toString('base64url');

const createCodeChallenge = (verifier: string) =>
  createHash('sha256').update(verifier).digest('base64url');

const signStatePayload = (payload: OAuthStatePayload): string => {
  const payloadBuffer = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const signature = createHmac('sha256', config.security.jwt.refresh.secret)
    .update(payloadBuffer)
    .digest('base64url');
  return `${payloadBuffer}.${signature}`;
};

const verifyAndDecodeState = (state: string): OAuthStatePayload | undefined => {
  const parts = state.split('.');
  if (parts.length !== 2) {
    return undefined;
  }

  const [encodedPayload, signature] = parts;
  const expectedSignature = createHmac('sha256', config.security.jwt.refresh.secret)
    .update(encodedPayload)
    .digest('base64url');

  const provided = Buffer.from(signature, 'base64url');
  const expected = Buffer.from(expectedSignature, 'base64url');

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return undefined;
  }

  const payloadJson = Buffer.from(encodedPayload, 'base64url').toString('utf-8');
  const payload = JSON.parse(payloadJson) as OAuthStatePayload;

  if (payload.expiresAt < Date.now()) {
    return undefined;
  }

  return payload;
};

const authRoutes: FastifyPluginAsync = async (app) => {
  const router = app.withTypeProvider<ZodTypeProvider>();
  const deps: AuthServiceDeps = {
    signAccessToken: app.jwtTokens.signAccessToken,
    signRefreshToken: app.jwtTokens.signRefreshToken,
    verifyAccessToken: app.jwtTokens.verifyAccessToken,
    verifyRefreshToken: app.jwtTokens.verifyRefreshToken,
  };

  router.post(
    '/auth/register',
    {
      schema: {
        body: registerBodySchema,
        response: {
          201: authTokensSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const tokens = await registerLocalAccount(deps, request.body);
        return reply.code(201).send(tokens);
      } catch (error) {
        app.log.warn({ err: error }, 'Registration failed');
        throw app.httpErrors.conflict('Email already registered');
      }
    },
  );

  router.post(
    '/auth/login',
    {
      schema: {
        body: loginBodySchema,
        response: {
          200: authTokensSchema,
          202: twoFactorChallengeResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await loginWithPassword(deps, request.body, {
          trustedDevice: request.body.trustedDevice,
          userAgent: request.headers['user-agent'] ?? null,
          ipAddress: request.ip,
        });

        if (result.type === 'tokens') {
          return reply.send(result.tokens);
        }

        return reply.status(202).send(result);
      } catch (error) {
        app.log.warn({ err: error }, 'Login failed');
        throw app.httpErrors.unauthorized('Invalid credentials');
      }
    },
  );

  router.post(
    '/auth/login/challenge',
    {
      config: { rateLimit: { ...app.rateLimitProfiles.twoFactorVerification } },
      schema: {
        body: loginChallengeBodySchema,
        response: {
          200: loginChallengeSuccessSchema,
        },
      },
    },
    async (request) => {
      try {
        const outcome = await completeTwoFactorLogin(deps, {
          challengeId: request.body.challengeId,
          challengeToken: request.body.challengeToken,
          code: request.body.code,
          rememberDevice: request.body.rememberDevice,
          deviceName: request.body.deviceName ?? null,
          userAgent: request.headers['user-agent'] ?? null,
          ipAddress: request.ip,
        });

        return {
          ...outcome.tokens,
          trustedDevice: outcome.trustedDevice,
        };
      } catch (error) {
        app.log.warn({ err: error }, 'Two-factor challenge completion failed');
        throw app.httpErrors.unauthorized('Invalid or expired two-factor challenge');
      }
    },
  );

  router.post(
    '/auth/token/refresh',
    {
      schema: {
        body: refreshTokenBodySchema,
        response: {
          200: authTokensSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const tokens = await refreshTokens(deps, request.body);
        return reply.send(tokens);
      } catch (error) {
        app.log.warn({ err: error }, 'Refresh token failed');
        throw app.httpErrors.unauthorized('Invalid refresh token');
      }
    },
  );

  router.post(
    '/auth/logout',
    {
      schema: {
        response: {
          204: { type: 'null' },
        },
      },
    },
    async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch {
        throw app.httpErrors.unauthorized();
      }

      await app.verifyActiveSession(request);

      const authHeader = request.headers.authorization;
      let sessionId = (request.user as { sid?: string } | undefined)?.sid;

      if (!sessionId && authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice('Bearer '.length).trim();
        sessionId = await extractSessionIdFromToken({ verifyAccessToken: deps.verifyAccessToken }, token);
      }

      if (!sessionId) {
        throw app.httpErrors.badRequest('Unable to determine session to revoke');
      }

      revokeSession(sessionId);
      return reply.code(204).send();
    },
  );

  router.get(
    '/auth/me',
    {
      schema: {
        response: {
          200: currentUserResponseSchema,
        },
      },
    },
    async (request) => {
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

      const currentUser = loadCurrentUser(userId);
      if (!currentUser) {
        throw app.httpErrors.notFound('User not found');
      }

      return currentUser;
    },
  );

  router.get(
    '/auth/42/start',
    {
      schema: {
        querystring: oauth42StartQuerySchema,
      },
    },
    async (request, reply) => {
      const codeVerifier = createCodeVerifier();
      const codeChallenge = createCodeChallenge(codeVerifier);
      const state = signStatePayload({
        nonce: randomBytes(16).toString('base64url'),
        codeVerifier,
        expiresAt: Date.now() + STATE_TTL_MS,
        redirectUri: request.query.redirectUri,
      });

      const authorizationUrl = buildAuthorizationUrl({
        state,
        codeChallenge,
        redirectUri: request.query.redirectUri,
      });

      return reply.redirect(authorizationUrl);
    },
  );

  router.get(
    '/auth/42/callback',
    {
      schema: {
        querystring: oauth42CallbackQuerySchema,
        response: {
          200: authTokensSchema,
          202: twoFactorChallengeResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { code, state } = request.query;

      const payload = verifyAndDecodeState(state);
      if (!payload) {
        app.log.warn('OAuth state validation failed');
        throw app.httpErrors.badRequest('Invalid OAuth state');
      }

      const tokenResponse = await exchangeAuthorizationCode(
        code,
        payload.codeVerifier,
        payload.redirectUri,
      );
      const profile = await fetchProfile(tokenResponse.access_token);

      const email = profile.email || `${profile.id}@oauth42.local`; // fallback when email not provided
      const userId = findOrCreateOauthUser(profile.id, {
        email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl ?? null,
      });

      const result = await authenticateUser(deps, userId, {
        userAgent: request.headers['user-agent'] ?? null,
        ipAddress: request.ip,
      });

      if (result.type === 'tokens') {
        return reply.send(result.tokens);
      }

      return reply.status(202).send(result);
    },
  );
};

export default fp(authRoutes, {
  name: 'auth-routes',
});
