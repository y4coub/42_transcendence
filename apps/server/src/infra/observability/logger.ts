import pino, { stdSerializers, type Bindings } from 'pino';

import { config } from '@infra/config/env';

const buildLogger = () =>
  pino({
    level: config.logging.level,
    base: {
      service: 'ft-transcendence-api',
      env: config.nodeEnv,
    },
    serializers: {
      err: stdSerializers.err,
      req: (req: { id?: unknown; method?: string; url?: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res: { statusCode?: number }) => ({
        statusCode: res.statusCode,
      }),
    },
    transport:
      config.nodeEnv === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
            },
          }
        : undefined,
  });

const rootLogger = buildLogger();

export const createLogger = (bindings?: Bindings) => {
  return bindings ? rootLogger.child(bindings) : rootLogger;
};

export const createModuleLogger = (moduleName: string, bindings?: Bindings) => {
  const merged = { module: moduleName, ...(bindings ?? {}) };
  return createLogger(merged);
};

export const logger = rootLogger;

export const createAuditLogger = (category: string, bindings?: Bindings) => {
  return createLogger({
    audit: true,
    auditCategory: category,
    ...(bindings ?? {}),
  });
};