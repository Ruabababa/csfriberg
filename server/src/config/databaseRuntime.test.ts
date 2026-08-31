import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'DB_CLIENT',
  'DB_URL',
  'DB_DATABASE_URL',
  'DB_POSTGRES_URL',
  'NODE_ENV',
  'VERCEL',
  'VERCEL_ENV',
  'JWT_SECRET',
  'GUEST_ID_SALT',
  'REDIS_REQUIRED',
  'REDIS_URL',
  'TRUST_PROXY',
  'MULTIPLAYER_ENABLED',
  'VITE_MULTIPLAYER_ENABLED',
  'CORS_ORIGINS',
  'SHOW_LEADERBOARD',
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

describe('Vercel database runtime configuration', () => {
  async function expectProductionConfigError(
    mutate: () => void,
    error: string,
  ): Promise<void> {
    process.env.NODE_ENV = 'production';
    process.env.DB_CLIENT = 'pg';
    process.env.DB_URL = 'postgresql://example.invalid/siegeguess';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.GUEST_ID_SALT = 'b'.repeat(32);
    process.env.REDIS_REQUIRED = 'true';
    process.env.REDIS_URL = 'rediss://redis.example.invalid:6380';
    process.env.TRUST_PROXY = 'true';
    process.env.MULTIPLAYER_ENABLED = 'false';
    process.env.VITE_MULTIPLAYER_ENABLED = 'false';
    process.env.CORS_ORIGINS = 'https://siegeguess.example';
    mutate();
    vi.resetModules();
    const { validateProductionConfig } = await import('../config');
    expect(() => validateProductionConfig()).toThrow(error);
  }

  it('uses the pooled Neon integration URL when custom database variables are absent', async () => {
    delete process.env.DB_CLIENT;
    delete process.env.DB_URL;
    delete process.env.DB_POSTGRES_URL;
    process.env.DB_DATABASE_URL = 'postgresql://example.invalid/siegeguess';
    process.env.VERCEL = '1';

    const { config } = await import('../config');

    expect(config.dbClient).toBe('pg');
    expect(config.dbUrl).toBe(process.env.DB_DATABASE_URL);
  });

  it('normalizes whitespace around Vercel database variables', async () => {
    process.env.DB_CLIENT = '  PG\r\n';
    process.env.DB_URL = '  postgresql://example.invalid/siegeguess  ';

    const { config } = await import('../config');

    expect(config.dbClient).toBe('pg');
    expect(config.dbUrl).toBe('postgresql://example.invalid/siegeguess');
  });

  it('normalizes whitespace around boolean environment variables', async () => {
    process.env.REDIS_REQUIRED = ' true\r\n';
    process.env.TRUST_PROXY = ' TRUE ';
    process.env.MULTIPLAYER_ENABLED = ' true\n';
    process.env.SHOW_LEADERBOARD = ' false\r\n';

    const { config } = await import('../config');

    expect(config.redisRequired).toBe(true);
    expect(config.trustProxy).toBe(true);
    expect(config.multiplayerEnabled).toBe(true);
    expect(config.showLeaderboard).toBe(false);
  });

  it('never falls back to SQLite inside a Vercel function', async () => {
    delete process.env.DB_CLIENT;
    delete process.env.DB_URL;
    delete process.env.DB_DATABASE_URL;
    delete process.env.DB_POSTGRES_URL;
    process.env.VERCEL = '1';

    const { config } = await import('../config');

    expect(config.dbClient).toBe('pg');
  });

  it('validates production requirements even when NODE_ENV is missing on Vercel', async () => {
    process.env.VERCEL = '1';
    delete process.env.NODE_ENV;
    delete process.env.DB_CLIENT;
    process.env.DB_DATABASE_URL = 'postgresql://example.invalid/siegeguess';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.GUEST_ID_SALT = 'b'.repeat(32);
    process.env.REDIS_REQUIRED = 'false';

    const { validateProductionConfig } = await import('../config');

    expect(() => validateProductionConfig()).toThrow('NODE_ENV_MUST_BE_PRODUCTION');
  });

  it('rejects unsafe production fallbacks and launch-incompatible configuration', async () => {
    await expectProductionConfigError(() => { delete process.env.GUEST_ID_SALT; }, 'GUEST_ID_SALT_MUST_BE_AT_LEAST_32_RANDOM_BYTES');
    await expectProductionConfigError(() => { process.env.GUEST_ID_SALT = process.env.JWT_SECRET; }, 'GUEST_ID_SALT_MUST_DIFFER_FROM_JWT_SECRET');
    await expectProductionConfigError(() => { process.env.REDIS_URL = 'redis://127.0.0.1:6379'; }, 'LOCAL_REDIS_FORBIDDEN_IN_PRODUCTION');
    await expectProductionConfigError(() => { process.env.TRUST_PROXY = 'false'; }, 'TRUST_PROXY_MUST_BE_TRUE_IN_PRODUCTION');
    await expectProductionConfigError(() => { process.env.CORS_ORIGINS = 'http://localhost:5173'; }, 'LOCAL_CORS_ORIGIN_FORBIDDEN_IN_PRODUCTION');
    await expectProductionConfigError(() => {
      process.env.VERCEL = '1';
      process.env.MULTIPLAYER_ENABLED = 'true';
    }, 'MULTIPLAYER_MUST_BE_DISABLED_FOR_VERCEL_LAUNCH');
    await expectProductionConfigError(() => {
      process.env.VERCEL = '1';
      process.env.VITE_MULTIPLAYER_ENABLED = 'true';
    }, 'MULTIPLAYER_MUST_BE_DISABLED_FOR_VERCEL_LAUNCH');
  });

  it('allows multiplayer on a persistent production host', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DB_CLIENT = 'pg';
    process.env.DB_URL = 'postgresql://example.invalid/siegeguess';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.GUEST_ID_SALT = 'b'.repeat(32);
    process.env.REDIS_REQUIRED = 'true';
    process.env.REDIS_URL = 'rediss://redis.example.invalid:6380';
    process.env.TRUST_PROXY = 'true';
    process.env.MULTIPLAYER_ENABLED = 'true';
    process.env.VITE_MULTIPLAYER_ENABLED = 'true';
    process.env.CORS_ORIGINS = 'https://siegeguess.example';
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;

    const { validateProductionConfig } = await import('../config');

    expect(() => validateProductionConfig()).not.toThrow();
  });
});
