import fastifyJwt from '@fastify/jwt';
import fp from 'fastify-plugin';
import { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { config } from '@infra/config/env';
import { getSessionById } from '@auth/repository';

declare module 'fastify' {
  interface FastifyInstance {
    jwtTokens: {
      signAccessToken: (payload: Record<string, unknown>) => Promise<string>;
      verifyAccessToken: (token: string) => Promise<unknown>;
      signRefreshToken: (payload: Record<string, unknown>) => Promise<string>;
      verifyRefreshToken: (token: string) => Promise<unknown>;
    };
    verifyActiveSession: (request: FastifyRequest) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: Record<string, unknown>;
  }
}

const accessTtl = `${config.security.jwt.access.ttlSeconds}s`;
const refreshTtl = `${config.security.jwt.refresh.ttlSeconds}s`;

const jwtPlugin: FastifyPluginAsync = async (app) => {
  await app.register(fastifyJwt, {
    secret: config.security.jwt.access.secret,
    sign: {
      expiresIn: accessTtl,
    },
    verify: {
      maxAge: accessTtl,
    },
  });

  await app.register(fastifyJwt, {
    namespace: 'refresh',
    secret: config.security.jwt.refresh.secret,
    sign: {
      expiresIn: refreshTtl,
    },
    verify: {
      maxAge: refreshTtl,
    },
  });

  const accessJwt = app.jwt;
  const refreshJwt = (app.jwt as typeof app.jwt & Record<string, typeof app.jwt | undefined>).refresh;

  if (!refreshJwt) {
    throw new Error('Refresh JWT namespace failed to initialize');
  }

  const ensureActiveSession = (sessionId: string | undefined) => {
    if (!sessionId) {
      throw app.httpErrors.unauthorized('Missing session identifier');
    }

    const session = getSessionById(sessionId);
    if (!session || session.revokedAt || session.expiresAt <= Date.now()) {
      throw app.httpErrors.unauthorized('Session is no longer active');
    }
  };

  app.decorate('verifyActiveSession', async (request: FastifyRequest) => {
    const sid = (request.user as { sid?: string } | undefined)?.sid;
    ensureActiveSession(sid);
  });

  app.decorate('jwtTokens', {
    signAccessToken: async (payload: Record<string, unknown>) =>
      accessJwt.sign(payload, { expiresIn: accessTtl }),
    verifyAccessToken: async (token: string) => {
      const payload = (await accessJwt.verify(token)) as { sid?: string } | undefined;
      ensureActiveSession(payload?.sid);
      return payload;
    },
    signRefreshToken: async (payload: Record<string, unknown>) =>
      refreshJwt.sign(payload, { expiresIn: refreshTtl }),
    verifyRefreshToken: async (token: string) => refreshJwt.verify(token),
  });
};

export default fp(jwtPlugin, {
  name: 'jwt',
});