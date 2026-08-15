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
  'TRUST_PROXY',
  'MULTIPLAYER_ENABLED',
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

    expect(() => validateProductionConfig()).toThrow('REDIS_REQUIRED_MUST_BE_TRUE_IN_PRODUCTION');
  });
});
