import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';

import { config } from '@infra/config/env';

declare module 'fastify' {
  interface FastifyInstance {
    rateLimitProfiles: {
      default: {
        max: number;
        timeWindow: number;
      };
      twoFactorEnrollment: {
        max: number;
        timeWindow: number;
      };
      twoFactorVerification: {
        max: number;
        timeWindow: number;
      };
    };
  }
}

const isOriginAllowed = (origin: string | undefined): boolean => {
  if (!origin) {
    return true;
  }

  const allowed = config.security.cors.origins;
  if (allowed.includes('*')) {
    return true;
  }

  try {
    const originUrl = new URL(origin);
    const hostname = originUrl.hostname;

    return allowed.some((entry) => {
      if (entry === origin) {
        return true;
      }

      if (entry.startsWith('*.')) {
        const suffix = entry.slice(2);
        return hostname === suffix || hostname.endsWith(`.${suffix}`);
      }

      return false;
    });
  } catch {
    return false;
  }
};

const securityPlugin: FastifyPluginAsync = async (app) => {
  await app.register(cors, {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin not allowed by CORS'), false);
    },
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindowMs,
    allowList: config.rateLimit.allowList,
    hook: 'onRequest',
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
  });

  if (!app.hasDecorator('rateLimitProfiles')) {
    app.decorate('rateLimitProfiles', {
      default: {
        max: config.rateLimit.max,
        timeWindow: config.rateLimit.timeWindowMs,
      },
      twoFactorEnrollment: {
        max: 5,
        timeWindow: 60 * 1000,
      },
      twoFactorVerification: {
        max: 10,
        timeWindow: 5 * 60 * 1000,
      },
    });
  }
};

export default fp(securityPlugin, {
  name: 'security-plugins',
});