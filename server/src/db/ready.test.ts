import knex from 'knex';
import type { Knex } from 'knex';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertDatabaseReady, REQUIRED_COLUMNS } from './ready';
import { ensureSchema } from './schema';

const instances: ReturnType<typeof knex>[] = [];

afterEach(async () => {
  await Promise.all(instances.splice(0).map((instance) => instance.destroy()));
});

function createInstance() {
  const instance = knex({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
  });
  instances.push(instance);
  return instance;
}

describe('database readiness check', () => {
  it('accepts a fully migrated database without changing it', async () => {
    const instance = createInstance();
    await ensureSchema(instance);
    await expect(assertDatabaseReady(instance)).resolves.toBeUndefined();
  });

  it('rejects a database whose migration has not run', async () => {
    const instance = createInstance();
    await expect(assertDatabaseReady(instance)).rejects.toThrow('DATABASE_SCHEMA_NOT_READY');
  });

  it('checks the complete PostgreSQL schema with one query', async () => {
    const rows = Object.entries(REQUIRED_COLUMNS).flatMap(([table_name, columns]) =>
      columns.map((column_name) => ({ table_name, column_name }))
    );
    const raw = vi.fn().mockResolvedValue({ rows });
    const instance = {
      client: { config: { client: 'pg' } },
      raw,
    } as unknown as Knex;

    await expect(assertDatabaseReady(instance)).resolves.toBeUndefined();
    expect(raw).toHaveBeenCalledTimes(1);
    expect(raw.mock.calls[0][0]).toContain('information_schema.columns');
  });

  it('reports missing PostgreSQL tables from the combined schema query', async () => {
    const rows = Object.entries(REQUIRED_COLUMNS)
      .filter(([table]) => table !== 'announcements')
      .flatMap(([table_name, columns]) =>
        columns.map((column_name) => ({ table_name, column_name }))
      );
    const instance = {
      client: { config: { client: 'pg' } },
      raw: vi.fn().mockResolvedValue({ rows }),
    } as unknown as Knex;

    await expect(assertDatabaseReady(instance)).rejects.toThrow(
      'DATABASE_SCHEMA_NOT_READY:announcements'
    );
  });
});
