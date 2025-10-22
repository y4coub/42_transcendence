import fs from 'node:fs';
import path from 'node:path';

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const ROOT_ENV_PATH = path.resolve(process.cwd(), '../../.env');
const LOCAL_ENV_PATH = path.resolve(process.cwd(), '.env');

if (fs.existsSync(ROOT_ENV_PATH)) {
  loadDotenv({ path: ROOT_ENV_PATH });
} else if (fs.existsSync(LOCAL_ENV_PATH)) {
  loadDotenv({ path: LOCAL_ENV_PATH });
} else {
  loadDotenv();
}

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
    .default('info'),
  TRUST_PROXY: z.coerce.boolean().default(true),
  DATABASE_URL: z.string().min(1).regex(/^file:/, {
    message: 'DATABASE_URL must use the file: scheme for SQLite',
  }),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  ARGON2_MEMORY_COST: z.coerce.number().int().positive().default(19_456),
  ARGON2_TIME_COST: z.coerce.number().int().positive().default(2),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_TIME_WINDOW: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_ALLOWLIST: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
    ),
  CORS_ORIGINS: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean)
        : undefined,
    ),
  PUBLIC_DOMAIN: z.string().min(1),
  CADDY_ADMIN_EMAIL: z.string().email().optional(),
  OAUTH42_CLIENT_ID: z.string().min(1),
  OAUTH42_CLIENT_SECRET: z.string().min(1),
  OAUTH42_REDIRECT_URI: z.string().url(),
  OAUTH42_AUTH_URL: z.string().url().optional(),
  OAUTH42_TOKEN_URL: z.string().url().optional(),
  OAUTH42_API_BASE_URL: z.string().url().optional(),
  TWOFA_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, {
      message: 'TWOFA_ENCRYPTION_KEY must be a 64-character hexadecimal string',
    }),
  TWOFA_CHALLENGE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  TWOFA_RECOVERY_CODES_COUNT: z.coerce
    .number()
    .int()
    .min(1)
    .max(20)
    .default(10),
  TWOFA_TRUSTED_DEVICE_SECRET: z.string().min(32),
  TWOFA_TRUSTED_DEVICE_TTL_DAYS: z.coerce.number().int().positive().default(30),
  TWOFA_TRUSTED_DEVICE_MAX: z.coerce.number().int().positive().default(5),
});

const parsedConfig = configSchema.safeParse(process.env);

if (!parsedConfig.success) {
  // eslint-disable-next-line no-console
  console.error('Environment configuration invalid', parsedConfig.error.format());
  throw new Error('Environment configuration failed validation.');
}

const env = parsedConfig.data;

const corsOrigins = env.CORS_ORIGINS ?? [
  `https://${env.PUBLIC_DOMAIN}`,
  "https://localhost",
  'http://localhost:5173',
  'http://localhost:3000',
];

export const config = {
  nodeEnv: env.NODE_ENV,
  server: {
    host: env.API_HOST,
    port: env.API_PORT,
    trustProxy: env.TRUST_PROXY,
  },
  logging: {
    level: env.API_LOG_LEVEL,
  },
  security: {
    cors: {
      origins: corsOrigins,
    },
    jwt: {
      access: {
        secret: env.JWT_ACCESS_SECRET,
        ttlSeconds: env.JWT_ACCESS_TTL_SECONDS,
      },
      refresh: {
        secret: env.JWT_REFRESH_SECRET,
        ttlSeconds: env.JWT_REFRESH_TTL_SECONDS,
      },
    },
    argon2: {
      memoryCost: env.ARGON2_MEMORY_COST,
      timeCost: env.ARGON2_TIME_COST,
    },
    twofa: {
      encryptionKey: Buffer.from(env.TWOFA_ENCRYPTION_KEY, 'hex'),
      challengeTtlSeconds: env.TWOFA_CHALLENGE_TTL_SECONDS,
      recoveryCodesCount: env.TWOFA_RECOVERY_CODES_COUNT,
      trustedDevices: {
        secret: env.TWOFA_TRUSTED_DEVICE_SECRET,
        ttlDays: env.TWOFA_TRUSTED_DEVICE_TTL_DAYS,
        maxRemembered: env.TWOFA_TRUSTED_DEVICE_MAX,
      },
    },
  },
  database: {
    url: env.DATABASE_URL,
  },
  rateLimit: {
    max: env.RATE_LIMIT_MAX,
    timeWindowMs: env.RATE_LIMIT_TIME_WINDOW * 1000,
    allowList: env.RATE_LIMIT_ALLOWLIST ?? [],
  },
  proxy: {
    publicDomain: env.PUBLIC_DOMAIN,
    adminEmail: env.CADDY_ADMIN_EMAIL,
  },
  oauth: {
    fortyTwo: {
      clientId: env.OAUTH42_CLIENT_ID,
      clientSecret: env.OAUTH42_CLIENT_SECRET,
      redirectUri: env.OAUTH42_REDIRECT_URI,
      authUrl: env.OAUTH42_AUTH_URL ?? 'https://api.intra.42.fr/oauth/authorize',
      tokenUrl: env.OAUTH42_TOKEN_URL ?? 'https://api.intra.42.fr/oauth/token',
      apiBaseUrl: env.OAUTH42_API_BASE_URL ?? 'https://api.intra.42.fr/v2',
      defaultScope: 'public',
    },
  },
} as const;

export type AppConfig = typeof config;
