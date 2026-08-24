import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { resolveUmamiConfig } from './services/umami';

const repoEnvPath = path.resolve(__dirname, '../../.env');
const serverEnvPath = path.resolve(__dirname, '../.env');

// The repository-level .env is the primary configuration used by the root scripts.
// Keep server/.env as a fallback for existing deployments.
dotenv.config({ path: repoEnvPath });
dotenv.config({ path: serverEnvPath });

const configuredJwtSecret = process.env.JWT_SECRET?.trim();
const configuredGuestIdSalt = process.env.GUEST_ID_SALT?.trim();
const configuredRedisUrl = process.env.REDIS_URL?.trim();
const unsafeJwtSecrets = new Set(['dev-secret', 'change-me-in-production']);
const jwtSecret = configuredJwtSecret || crypto.randomBytes(48).toString('base64url');
const configuredPasswordWorkers = Number(process.env.PASSWORD_WORKERS || 2);
const configuredPasswordQueueLimit = Number(process.env.PASSWORD_QUEUE_LIMIT || 64);
const configuredBcryptRounds = Number(process.env.BCRYPT_ROUNDS || 8);
const configuredAdminImportBodyLimitBytes = Number(
  process.env.ADMIN_IMPORT_BODY_LIMIT_BYTES || 2 * 1024 * 1024
);
const normalizedEnvValue = (value: string | undefined) => value?.trim().toLowerCase();
const isVercelRuntime = normalizedEnvValue(process.env.VERCEL) === '1' ||
  Boolean(process.env.VERCEL_ENV?.trim());
const configuredDbUrl =
  process.env.DB_URL?.trim() ||
  process.env.DB_DATABASE_URL?.trim() ||
  process.env.DB_POSTGRES_URL?.trim() ||
  './data/csgofriberg.sqlite3';
const configuredDbClient = process.env.DB_CLIENT?.trim().toLowerCase() ||
  (isVercelRuntime || /^postgres(?:ql)?:\/\//i.test(configuredDbUrl) ? 'pg' : 'sqlite');
const vercelOrigins = [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
  .map((value) => value?.trim())
  .filter((value): value is string => Boolean(value))
  .map((value) => value.startsWith('http://') || value.startsWith('https://')
    ? value
    : `https://${value}`);
const configuredCorsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

export const config = {
  port: Number(process.env.PORT || 3000),
  jwtSecret,
  guestIdSalt: configuredGuestIdSalt || jwtSecret,
  dbClient: configuredDbClient as 'sqlite' | 'pg',
  dbUrl: configuredDbUrl,
  dbPoolMin: Number(process.env.DB_POOL_MIN || 0),
  dbPoolMax: Number(process.env.DB_POOL_MAX || 1),
  dbAcquireTimeoutMs: Math.max(500, Number(process.env.DB_ACQUIRE_TIMEOUT_MS || 3000)),
  trustProxy: normalizedEnvValue(process.env.TRUST_PROXY) === 'true',
  redisUrl: configuredRedisUrl || 'redis://127.0.0.1:6379',
  redisPrefix: process.env.REDIS_PREFIX || 'csgofriberg:',
  redisRequired: normalizedEnvValue(process.env.REDIS_REQUIRED) === 'true',
  redisCommandTimeoutMs: Number(process.env.REDIS_COMMAND_TIMEOUT_MS || 1500),
  roomLockWaitMs: Math.max(
    100,
    Math.min(5_000, Number(process.env.ROOM_LOCK_WAIT_MS) || 1_000)
  ),
  passwordWorkers: Number.isInteger(configuredPasswordWorkers)
    ? Math.max(1, Math.min(4, configuredPasswordWorkers))
    : 2,
  passwordQueueLimit: Number.isInteger(configuredPasswordQueueLimit)
    ? Math.max(8, configuredPasswordQueueLimit)
    : 64,
  bcryptRounds: Number.isInteger(configuredBcryptRounds)
    ? Math.max(8, Math.min(12, configuredBcryptRounds))
    : 8,
  adminImportBodyLimitBytes:
    Number.isInteger(configuredAdminImportBodyLimitBytes) && configuredAdminImportBodyLimitBytes >= 64 * 1024
      ? configuredAdminImportBodyLimitBytes
      : 2 * 1024 * 1024,
  disconnectForfeitMs: Math.max(100, Number(process.env.DISCONNECT_FORFEIT_MS || 30_000)),
  matchReadyTimeoutMs: 30_000,
  powDifficulty: Number(process.env.POW_DIFFICULTY || 17),
  powChallengeTtlSeconds: Number(process.env.POW_CHALLENGE_TTL_SECONDS || 120),
  powTokenTtlSeconds: Number(process.env.POW_TOKEN_TTL_SECONDS || 600),
  showLeaderboard: normalizedEnvValue(process.env.SHOW_LEADERBOARD) !== 'false',
  multiplayerEnabled: normalizedEnvValue(process.env.MULTIPLAYER_ENABLED) === 'true',
  umami: resolveUmamiConfig({
    websiteId: process.env.UMAMI_WEBSITE_ID,
    scriptUrl: process.env.UMAMI_SCRIPT_URL,
  }),
  corsOrigins: [...new Set([...configuredCorsOrigins, ...vercelOrigins])],
};

export function validateProductionConfig(): void {
  if (!Number.isInteger(config.powDifficulty) || config.powDifficulty < 16 || config.powDifficulty > 24) {
    throw new Error('POW_DIFFICULTY_MUST_BE_BETWEEN_16_AND_24');
  }
  if (normalizedEnvValue(process.env.NODE_ENV) !== 'production' && !isVercelRuntime) return;
  if (normalizedEnvValue(process.env.NODE_ENV) !== 'production') {
    throw new Error('NODE_ENV_MUST_BE_PRODUCTION');
  }
  if (
    !configuredJwtSecret ||
    Buffer.byteLength(configuredJwtSecret, 'utf8') < 32 ||
    unsafeJwtSecrets.has(configuredJwtSecret)
  ) {
    throw new Error('JWT_SECRET_MUST_BE_AT_LEAST_32_RANDOM_BYTES');
  }
  if (
    !configuredGuestIdSalt ||
    Buffer.byteLength(configuredGuestIdSalt, 'utf8') < 32
  ) {
    throw new Error('GUEST_ID_SALT_MUST_BE_AT_LEAST_32_RANDOM_BYTES');
  }
  if (configuredGuestIdSalt === configuredJwtSecret) {
    throw new Error('GUEST_ID_SALT_MUST_DIFFER_FROM_JWT_SECRET');
  }
  if (config.dbClient !== 'pg') throw new Error('POSTGRESQL_REQUIRED_IN_PRODUCTION');
  if (!configuredDbUrl || !/^postgres(?:ql):\/\//i.test(configuredDbUrl)) {
    throw new Error('POSTGRESQL_URL_REQUIRED_IN_PRODUCTION');
  }
  if (!config.redisRequired) throw new Error('REDIS_REQUIRED_MUST_BE_TRUE_IN_PRODUCTION');
  if (!configuredRedisUrl) throw new Error('REDIS_URL_REQUIRED_IN_PRODUCTION');
  try {
    const redisUrl = new URL(configuredRedisUrl);
    if (!['redis:', 'rediss:'].includes(redisUrl.protocol)) {
      throw new Error('REDIS_URL_INVALID_IN_PRODUCTION');
    }
    if (['localhost', '127.0.0.1', '::1'].includes(redisUrl.hostname.toLowerCase())) {
      throw new Error('LOCAL_REDIS_FORBIDDEN_IN_PRODUCTION');
    }
  } catch (error) {
    if (error instanceof Error && error.message.endsWith('_IN_PRODUCTION')) throw error;
    throw new Error('REDIS_URL_INVALID_IN_PRODUCTION');
  }
  if (!config.trustProxy) throw new Error('TRUST_PROXY_MUST_BE_TRUE_IN_PRODUCTION');
  if (config.multiplayerEnabled || normalizedEnvValue(process.env.VITE_MULTIPLAYER_ENABLED) === 'true') {
    throw new Error('MULTIPLAYER_MUST_BE_DISABLED_FOR_VERCEL_LAUNCH');
  }
  if (!configuredCorsOrigins.length || configuredCorsOrigins.some((origin) => /localhost|127\.0\.0\.1|\[::1\]/i.test(origin))) {
    throw new Error('LOCAL_CORS_ORIGIN_FORBIDDEN_IN_PRODUCTION');
  }
}
