import { timingSafeEqual } from 'node:crypto';

import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fastifyApiReference from '@scalar/fastify-api-reference';

type AuthCredentials = {
  username: string;
  password: string;
};

const HASHED_CACHE_CONTROL = {
  production: 'private, max-age=86400, immutable',
  development: 'private, max-age=5, must-revalidate',
  test: 'private, max-age=5, must-revalidate',
} as const;

const getCacheControl = (nodeEnv: string): string => {
  if (nodeEnv === 'production') {
    return HASHED_CACHE_CONTROL.production;
  }

  if (nodeEnv === 'test') {
    return HASHED_CACHE_CONTROL.test;
  }

  return HASHED_CACHE_CONTROL.development;
};

const decodeBasicAuthHeader = (headerValue: string): AuthCredentials | null => {
  if (!headerValue.toLowerCase().startsWith('basic ')) {
    return null;
  }

  const base64Payload = headerValue.slice(6).trim();
  if (!base64Payload) {
    return null;
  }

  let decoded: string;
  try {
    decoded = Buffer.from(base64Payload, 'base64').toString('utf-8');
  } catch {
    return null;
  }

  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) {
    return null;
  }

  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1),
  };
};

const timingSafeCompare = (a: string, b: string): boolean => {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
};

const verifyBasicAuth = (headerValue: string | undefined, credentials: AuthCredentials): boolean => {
  if (!headerValue) {
    return false;
  }

  const parsed = decodeBasicAuthHeader(headerValue);
  if (!parsed) {
    return false;
  }

  const usernameMatches = timingSafeCompare(parsed.username, credentials.username);
  const passwordMatches = timingSafeCompare(parsed.password, credentials.password);

  return usernameMatches && passwordMatches;
};

const docsRoutes: FastifyPluginAsync = async (app) => {
  const { nodeEnv } = app.config;
  const cacheControl = getCacheControl(nodeEnv);
  const docsBasicAuth = app.config.docs?.basicAuth;

  const ensureDocsAccess = async (request: FastifyRequest, reply: FastifyReply) => {
    if (nodeEnv !== 'production') {
      return;
    }

    if (docsBasicAuth && verifyBasicAuth(request.headers.authorization, docsBasicAuth)) {
      return;
    }

    try {
      await request.jwtVerify();
      await app.verifyActiveSession(request);
      return;
    } catch (error) {
      app.log.warn({ err: error, url: request.url }, 'Unauthorized docs access attempt');
    }

    reply.header('WWW-Authenticate', 'Basic realm="API Docs", charset="UTF-8"');
    throw app.httpErrors.unauthorized('Authentication required to access API documentation');
  };

  app.get('/api/openapi.json', async (request, reply) => {
    if (nodeEnv === 'production') {
      await ensureDocsAccess(request, reply);
    }

    try {
      const spec = await app.loadOpenapiJsonSpec();
      reply
        .type('application/json; charset=utf-8')
        .header('cache-control', cacheControl)
        .header('etag', `"${spec.hash}"`)
        .header('vary', 'Authorization');
      return reply.send(spec.content);
    } catch (error) {
      app.log.error({ err: error }, 'Failed to load bundled OpenAPI JSON');
      throw app.httpErrors.internalServerError('Unable to load OpenAPI specification');
    }
  });

  const specMeta = await app.loadOpenapiJsonSpec();
  const specUrl = nodeEnv === 'production' ? `/api/openapi.json?v=${specMeta.hash}` : '/api/openapi.json';

  await app.register(fastifyApiReference, {
    routePrefix: '/docs',
    logLevel: 'silent',
    configuration: {
      url: specUrl,
      pageTitle: 'FT Backend API Docs',
      theme: 'purple',
      layout: 'modern',
    },
    hooks: {
      onRequest: ensureDocsAccess,
    },
  });
};

export default fp(docsRoutes, {
  name: 'docs-routes',
});
