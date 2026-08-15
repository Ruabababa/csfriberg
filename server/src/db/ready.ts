import { Knex } from 'knex';
import { db } from './knex';

export const REQUIRED_COLUMNS: Record<string, string[]> = {
  users: ['id', 'username', 'password_hash', 'role', 'token_version', 'leaderboard_hidden', 'matchmaking_restricted'],
  api_tokens: ['id', 'name', 'token_hash', 'prefix', 'created_by_user_id', 'expires_at'],
  app_migrations: ['name', 'applied_at'],
  players: [
    'id',
    'nickname',
    'age',
    'major_championships',
    'major_appearances',
    'si_championships',
    'si_appearances',
    'status_raw',
    'major_si_championships',
    'major_si_appearances',
    'roles',
    'birth_date',
    'source_url',
    'source_provider',
    'source_player_id',
    'source_updated_at',
    'data_version',
    'major_si_event_ids',
    'major_si_championship_event_ids',
    'is_enabled',
  ],
  difficulty_levels: ['key', 'sort_order', 'is_enabled'],
  player_difficulties: ['player_id', 'difficulty_key'],
  games: ['id', 'session_id', 'user_id', 'guest_key', 'guess_times', 'first_guess_player_id', 'status'],
  match_records: [
    'id',
    'room_id',
    'db_type',
    'bo_type',
    'winner_id',
    'winner_key',
    'finish_reason',
    'forfeited_key',
    'replay',
  ],
  match_players: [
    'id',
    'match_id',
    'player_key',
    'is_winner',
    'winning_guess_sum',
    'winning_rounds',
  ],
  announcements: ['id', 'title', 'content', 'is_popup'],
};

function missingColumns(existingColumns: Map<string, Set<string>>): string[] {
  const missing: string[] = [];
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const existing = existingColumns.get(table);
    if (!existing) {
      missing.push(table);
      continue;
    }
    for (const column of columns) {
      if (!existing.has(column)) missing.push(`${table}.${column}`);
    }
  }
  return missing;
}

async function assertPostgresReady(instance: Knex): Promise<void> {
  const result = await instance.raw<{ rows: Array<{ table_name: string; column_name: string }> }>(
    `select table_name, column_name
       from information_schema.columns
      where table_schema = current_schema()
        and table_name = any(?::text[])`,
    [Object.keys(REQUIRED_COLUMNS)]
  );
  const existingColumns = new Map<string, Set<string>>();
  for (const row of result.rows) {
    const columns = existingColumns.get(row.table_name) ?? new Set<string>();
    columns.add(row.column_name);
    existingColumns.set(row.table_name, columns);
  }
  const missing = missingColumns(existingColumns);
  if (missing.length) throw new Error(`DATABASE_SCHEMA_NOT_READY:${missing.join(',')}`);
}

/** Applications only verify the migrated schema; DDL remains owned by the migrate service. */
export async function assertDatabaseReady(instance: Knex = db): Promise<void> {
  if (instance.client.config.client === 'pg') {
    await assertPostgresReady(instance);
    return;
  }
  await instance.raw('select 1');
  const existingColumns = new Map<string, Set<string>>();
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    if (!(await instance.schema.hasTable(table))) {
      continue;
    }
    const existing = new Set<string>();
    for (const column of columns) {
      if (await instance.schema.hasColumn(table, column)) existing.add(column);
    }
    existingColumns.set(table, existing);
  }
  const missing = missingColumns(existingColumns);
  if (missing.length) throw new Error(`DATABASE_SCHEMA_NOT_READY:${missing.join(',')}`);
}
