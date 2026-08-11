import { Knex } from 'knex';
import { db } from './knex';
import { userNameFromUsername } from '../services/identityDisplay';
import { DIFFICULTY_LEVELS } from '../difficulties';
import { winningGuessMetricsByPlayer } from '../services/matchGuessMetrics';

const FIRST_GUESS_BACKFILL_BATCH_SIZE = 1000;
const USER_DISPLAY_ID_BACKFILL_BATCH_SIZE = 1000;
const PLAYER_DIFFICULTIES_BACKFILL_MIGRATION = '20260724-player-difficulties-backfill';
const MULTI_WINNING_GUESSES_BACKFILL_MIGRATION = '20260729-multi-winning-guesses-backfill';
const MULTI_WINNING_GUESSES_BACKFILL_BATCH_SIZE = 200;
const R6_PLAYER_FIELDS_MIGRATION = '20260801-r6-player-fields-v1';
const R6_SOURCE_IDENTITY_MIGRATION = '20260804-r6-source-identity-v1';
const R6_SCRAPER_FIELDS_MIGRATION = '20260809-r6-scraper-fields-v1';

async function migrateR6ScraperFields(instance: Knex): Promise<void> {
  const applied = await instance('app_migrations')
    .where({ name: R6_SCRAPER_FIELDS_MIGRATION })
    .first();
  if (applied) return;

  if (instance.client.config.client === 'pg') {
    await instance.raw('alter table "players" alter column "age" drop not null');
  } else {
    await instance.schema.alterTable('players', (table) => {
      table.integer('age').nullable().alter();
    });
  }
  await instance('players')
    .whereNull('status_raw')
    .update({ status_raw: instance.raw("case when is_active then 'Active' else 'Retired' end") });
  await instance('app_migrations').insert({ name: R6_SCRAPER_FIELDS_MIGRATION });
}

async function hasNicknameUniqueConstraint(instance: Knex): Promise<boolean> {
  if (instance.client.config.client === 'pg') {
    const row = await instance('information_schema.table_constraints')
      .where({
        table_name: 'players',
        constraint_name: 'players_nickname_unique',
        constraint_type: 'UNIQUE',
      })
      .first();
    return Boolean(row);
  }
  const rows = await instance.raw('pragma index_list("players")');
  return (rows as Array<{ name?: string }>).some((row) => row.name === 'players_nickname_unique');
}

async function migrateR6SourceIdentity(instance: Knex): Promise<void> {
  const applied = await instance('app_migrations')
    .where({ name: R6_SOURCE_IDENTITY_MIGRATION })
    .first();
  if (applied) return;

  if (await hasNicknameUniqueConstraint(instance)) {
    await instance.schema.alterTable('players', (table) => {
      table.dropUnique(['nickname'], 'players_nickname_unique');
    });
  }
  await instance.raw(
    'create unique index if not exists "players_source_identity_unique" on "players" ("source_provider", "source_player_id")'
  );
  await instance('app_migrations')
    .insert({ name: R6_SOURCE_IDENTITY_MIGRATION })
    .onConflict('name')
    .ignore();
}

export async function backfillLegacyPlayerDifficulties(instance: Knex = db): Promise<void> {
  if (!(await instance.schema.hasColumn('players', 'is_easy'))) return;
  await instance.transaction(async (trx) => {
    const applied = await trx('app_migrations')
      .where({ name: PLAYER_DIFFICULTIES_BACKFILL_MIGRATION })
      .first();
    if (applied) return;

    const players = await trx('players').select('id', 'is_easy');
    const memberships = players.flatMap((player) => [
      { player_id: player.id, difficulty_key: 'normal' },
      ...(Boolean(player.is_easy) ? [{ player_id: player.id, difficulty_key: 'easy' }] : []),
    ]);
    for (let index = 0; index < memberships.length; index += 500) {
      await trx('player_difficulties')
        .insert(memberships.slice(index, index + 500))
        .onConflict(['player_id', 'difficulty_key'])
        .ignore();
    }
    await trx('app_migrations')
      .insert({ name: PLAYER_DIFFICULTIES_BACKFILL_MIGRATION })
      .onConflict('name')
      .ignore();
  });
}

async function backfillUserDisplayIds(instance: Knex): Promise<void> {
  let cursor = 0;
  while (true) {
    const users = await instance('users')
      .select('id', 'username')
      .where('id', '>', cursor)
      .where((builder) => builder.whereNull('display_id').orWhere('display_id', ''))
      .orderBy('id')
      .limit(USER_DISPLAY_ID_BACKFILL_BATCH_SIZE);
    if (!users.length) return;
    cursor = Number(users[users.length - 1].id);
    await instance.transaction(async (trx) => {
      for (const user of users) {
        await trx('users').where({ id: user.id }).update({
          display_id: userNameFromUsername(user.username),
        });
      }
    });
  }
}

function firstGuessPlayerId(value: unknown): number {
  try {
    const guesses = JSON.parse(String(value));
    if (!Array.isArray(guesses) || !guesses.length) return 0;
    const first = guesses[0];
    const id = Number(
      typeof first === 'object' && first
        ? (first as { playerId?: unknown }).playerId
        : first
    );
    return Number.isInteger(id) && id > 0 ? id : 0;
  } catch {
    return 0;
  }
}

async function backfillFirstGuessPlayerIds(instance: Knex): Promise<void> {
  let cursor = 0;
  while (true) {
    const rows = await instance('games')
      .select('id', 'guesses')
      .where('id', '>', cursor)
      .whereNull('first_guess_player_id')
      .where('guess_count', '>', 0)
      .whereNot('status', 'playing')
      .orderBy('id')
      .limit(FIRST_GUESS_BACKFILL_BATCH_SIZE);
    if (!rows.length) return;
    cursor = Number(rows[rows.length - 1].id);

    const grouped = new Map<number, number[]>();
    for (const row of rows) {
      const playerId = firstGuessPlayerId(row.guesses);
      const ids = grouped.get(playerId) ?? [];
      ids.push(Number(row.id));
      grouped.set(playerId, ids);
    }
    await instance.transaction(async (trx) => {
      for (const [playerId, ids] of grouped) {
        await trx('games').whereIn('id', ids).update({ first_guess_player_id: playerId });
      }
    });
  }
}

async function backfillMultiWinningGuesses(instance: Knex): Promise<void> {
  const applied = await instance('app_migrations')
    .where({ name: MULTI_WINNING_GUESSES_BACKFILL_MIGRATION })
    .first();
  if (applied) return;

  let cursor = 0;
  while (true) {
    const matches = await instance('match_records')
      .select('id', 'replay')
      .where('id', '>', cursor)
      .orderBy('id')
      .limit(MULTI_WINNING_GUESSES_BACKFILL_BATCH_SIZE);
    if (!matches.length) break;
    cursor = Number(matches[matches.length - 1].id);
    await instance.transaction(async (trx) => {
      const matchIds = matches.map((match) => Number(match.id));
      await trx('match_players')
        .whereIn('match_id', matchIds)
        .update({ winning_guess_sum: 0, winning_rounds: 0 });
      for (const match of matches) {
        const metrics = winningGuessMetricsByPlayer(match.replay);
        for (const [playerKey, values] of metrics) {
          await trx('match_players')
            .where({ match_id: match.id, player_key: playerKey })
            .update({
              winning_guess_sum: values.winningGuessSum,
              winning_rounds: values.winningRounds,
            });
        }
      }
    });
  }

  await instance('app_migrations')
    .insert({ name: MULTI_WINNING_GUESSES_BACKFILL_MIGRATION })
    .onConflict('name')
    .ignore();
}

/**
 * Adds the R6-specific player contract without dropping the CS-era columns.
 * The old columns remain available for historical imports and replay data;
 * the cache layer exposes both names while the rest of the application moves
 * to the canonical major_si_* fields.
 */
async function backfillR6PlayerFields(instance: Knex): Promise<void> {
  const applied = await instance('app_migrations')
    .where({ name: R6_PLAYER_FIELDS_MIGRATION })
    .first();
  if (applied) return;

  const players = await instance('players').select(
    'id',
    'role',
    'major_championships',
    'major_appearances',
    'major_si_championships',
    'major_si_appearances',
    'roles',
    'major_si_event_ids',
    'major_si_championship_event_ids'
  );
  await instance.transaction(async (trx) => {
    for (const player of players) {
      const role = String(player.role ?? '').trim();
      await trx('players').where({ id: player.id }).update({
        major_si_championships: player.major_si_championships ?? player.major_championships ?? 0,
        major_si_appearances: player.major_si_appearances ?? player.major_appearances ?? 0,
        roles: player.roles ?? JSON.stringify(role ? [role] : []),
        major_si_event_ids: player.major_si_event_ids ?? '[]',
        major_si_championship_event_ids: player.major_si_championship_event_ids ?? '[]',
      });
    }
    await trx('app_migrations')
      .insert({ name: R6_PLAYER_FIELDS_MIGRATION })
      .onConflict('name')
      .ignore();
  });
}

export async function ensureSchema(instance: Knex = db): Promise<void> {
  if (!(await instance.schema.hasTable('users'))) {
    await instance.schema.createTable('users', (t) => {
      t.increments('id').primary();
      t.string('username', 32).notNullable().unique();
      t.string('display_id', 8).nullable();
      t.string('password_hash', 128).notNullable();
      t.string('role', 16).notNullable().defaultTo('user');
      t.integer('token_version').notNullable().defaultTo(0);
      t.boolean('leaderboard_hidden').notNullable().defaultTo(false);
      t.boolean('matchmaking_restricted').notNullable().defaultTo(false);
      t.timestamp('created_at').notNullable().defaultTo(instance.fn.now());
    });
  }
  if (!(await instance.schema.hasColumn('users', 'token_version'))) {
    await instance.schema.alterTable('users', (t) => t.integer('token_version').notNullable().defaultTo(0));
  }
  if (!(await instance.schema.hasColumn('users', 'display_id'))) {
    await instance.schema.alterTable('users', (t) => t.string('display_id', 8).nullable());
  }
  if (!(await instance.schema.hasColumn('users', 'leaderboard_hidden'))) {
    await instance.schema.alterTable('users', (t) => {
      t.boolean('leaderboard_hidden').notNullable().defaultTo(false);
    });
  }
  if (!(await instance.schema.hasColumn('users', 'matchmaking_restricted'))) {
    await instance.schema.alterTable('users', (t) => {
      t.boolean('matchmaking_restricted').notNullable().defaultTo(false);
    });
  }
  await backfillUserDisplayIds(instance);
  const usersIndexConcurrently = instance.client.config.client === 'pg' ? ' concurrently' : '';
  await instance.raw(
    `create index${usersIndexConcurrently} if not exists "users_display_id_idx" on "users" ("display_id")`
  );

  if (!(await instance.schema.hasTable('api_tokens'))) {
    await instance.schema.createTable('api_tokens', (t) => {
      t.increments('id').primary();
      t.string('name', 64).notNullable();
      t.string('token_hash', 64).notNullable().unique();
      t.string('prefix', 16).notNullable();
      t.integer('created_by_user_id')
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE');
      t.timestamp('expires_at').notNullable();
      t.timestamp('created_at').notNullable().defaultTo(instance.fn.now());
    });
  }
  const apiTokensIndexConcurrently = instance.client.config.client === 'pg' ? ' concurrently' : '';
  await instance.raw(
    `create index${apiTokensIndexConcurrently} if not exists "api_tokens_owner_created_idx" on "api_tokens" ("created_by_user_id", "created_at")`
  );

  if (!(await instance.schema.hasTable('app_migrations'))) {
    await instance.schema.createTable('app_migrations', (t) => {
      t.string('name', 128).primary();
      t.timestamp('applied_at').notNullable().defaultTo(instance.fn.now());
    });
  }

  if (!(await instance.schema.hasTable('players'))) {
    await instance.schema.createTable('players', (t) => {
      t.increments('id').primary();
      t.string('nickname', 64).notNullable();
      t.string('nationality', 64).notNullable();
      t.string('region', 32).notNullable().defaultTo('');
      t.string('team', 64).notNullable().defaultTo('');
      t.integer('age').nullable();
      t.string('role', 64).notNullable().defaultTo('Entry');
      t.integer('major_championships').notNullable().defaultTo(0);
      t.integer('major_appearances').notNullable().defaultTo(0);
      t.integer('si_championships').notNullable().defaultTo(0);
      t.integer('si_appearances').notNullable().defaultTo(0);
      t.string('status_raw', 32).nullable();
      t.integer('major_si_championships').nullable();
      t.integer('major_si_appearances').nullable();
      t.text('roles').nullable();
      t.date('birth_date').nullable();
      t.text('source_url').nullable();
      t.string('source_provider', 32).nullable();
      t.string('source_player_id', 256).nullable();
      t.timestamp('source_updated_at').nullable();
      t.string('data_version', 64).nullable();
      t.text('major_si_event_ids').nullable();
      t.text('major_si_championship_event_ids').nullable();
      t.boolean('is_active').notNullable().defaultTo(true);
      t.boolean('is_enabled').notNullable().defaultTo(true);
      t.timestamp('created_at').notNullable().defaultTo(instance.fn.now());
    });
  }
  const hasPlayerAge = await instance.schema.hasColumn('players', 'age');
  const hasPlayerBirthYear = await instance.schema.hasColumn('players', 'birth_year');
  if (!hasPlayerAge) {
    await instance.schema.alterTable('players', (t) => {
      t.integer('age').nullable();
    });
  }
  if (hasPlayerBirthYear) {
    const currentYear = new Date().getFullYear();
    const players = await instance('players').select('id', 'age', 'birth_year');
    for (const player of players) {
      if (player.age != null) continue;
      const age = currentYear - Number(player.birth_year);
      if (!Number.isInteger(age) || age < 0) {
        throw new Error(`INVALID_PLAYER_BIRTH_YEAR:${player.id}`);
      }
      await instance('players').where({ id: player.id }).update({ age });
    }
  }
  if (hasPlayerBirthYear) {
    await instance.schema.alterTable('players', (t) => {
      if (hasPlayerBirthYear) t.dropColumn('birth_year');
    });
  }
  if (!(await instance.schema.hasColumn('players', 'major_championships'))) {
    await instance.schema.alterTable('players', (t) => {
      t.integer('major_championships').notNullable().defaultTo(0);
    });
  }
  const r6PlayerColumns: Array<[string, (table: Knex.CreateTableBuilder) => void]> = [
    ['major_si_championships', (table) => table.integer('major_si_championships').nullable()],
    ['major_si_appearances', (table) => table.integer('major_si_appearances').nullable()],
    ['si_championships', (table) => table.integer('si_championships').notNullable().defaultTo(0)],
    ['si_appearances', (table) => table.integer('si_appearances').notNullable().defaultTo(0)],
    ['status_raw', (table) => table.string('status_raw', 32).nullable()],
    ['roles', (table) => table.text('roles').nullable()],
    ['birth_date', (table) => table.date('birth_date').nullable()],
    ['source_url', (table) => table.text('source_url').nullable()],
    ['source_provider', (table) => table.string('source_provider', 32).nullable()],
    ['source_player_id', (table) => table.string('source_player_id', 256).nullable()],
    ['source_updated_at', (table) => table.timestamp('source_updated_at').nullable()],
    ['data_version', (table) => table.string('data_version', 64).nullable()],
    ['major_si_event_ids', (table) => table.text('major_si_event_ids').nullable()],
    ['major_si_championship_event_ids', (table) => table.text('major_si_championship_event_ids').nullable()],
  ];
  for (const [column, addColumn] of r6PlayerColumns) {
    if (!(await instance.schema.hasColumn('players', column))) {
      await instance.schema.alterTable('players', addColumn);
    }
  }
  await migrateR6ScraperFields(instance);
  await backfillR6PlayerFields(instance);
  await migrateR6SourceIdentity(instance);
  if (!(await instance.schema.hasColumn('players', 'is_enabled'))) {
    await instance.schema.alterTable('players', (t) => {
      t.boolean('is_enabled').notNullable().defaultTo(true);
    });
  }
  if (await instance.schema.hasColumn('players', 'real_name')) {
    if (instance.client.config.client === 'pg') {
      await instance.raw('drop index if exists "players_real_name_trgm_idx"');
    }
    await instance.schema.alterTable('players', (t) => t.dropColumn('real_name'));
  }
  if (instance.client.config.client === 'pg') {
    await instance.raw('create extension if not exists pg_trgm');
    await instance.raw(
      'create index if not exists "players_nickname_trgm_idx" on "players" using gin ("nickname" gin_trgm_ops)'
    );
    await instance.raw(
      'create index if not exists "players_team_trgm_idx" on "players" using gin ("team" gin_trgm_ops)'
    );
  }

  // 旧版 games 表 user_id 不可空且无 guest_key;检测到旧结构则重建(开发期数据可丢弃)
  if (
    (await instance.schema.hasTable('games')) &&
    !(await instance.schema.hasColumn('games', 'guest_key'))
  ) {
    await instance.schema.dropTable('games');
  }
  if (!(await instance.schema.hasTable('games'))) {
    await instance.schema.createTable('games', (t) => {
      t.increments('id').primary();
      t.string('session_id', 64).nullable();
      t.integer('user_id').nullable().references('id').inTable('users');
      t.string('guest_key', 64).nullable().index();
      t.integer('target_player_id').notNullable().references('id').inTable('players');
      t.string('mode', 16).notNullable().defaultTo('easy');
      t.text('guesses').notNullable().defaultTo('[]');
      t.text('guess_times').notNullable().defaultTo('[]');
      t.integer('first_guess_player_id').nullable();
      t.string('status', 16).notNullable().defaultTo('playing');
      t.integer('guess_count').notNullable().defaultTo(0);
      t.timestamp('created_at').notNullable().defaultTo(instance.fn.now());
      t.timestamp('finished_at').nullable();
    });
  }
  if (!(await instance.schema.hasColumn('games', 'session_id'))) {
    await instance.schema.alterTable('games', (t) => t.string('session_id', 64).nullable());
  }
  if (!(await instance.schema.hasColumn('games', 'guess_times'))) {
    await instance.schema.alterTable('games', (t) => t.text('guess_times').notNullable().defaultTo('[]'));
  }
  if (!(await instance.schema.hasTable('difficulty_levels'))) {
    await instance.schema.createTable('difficulty_levels', (t) => {
      t.string('key', 32).primary();
      t.integer('sort_order').notNullable().defaultTo(0);
      t.boolean('is_enabled').notNullable().defaultTo(true);
      t.timestamp('created_at').notNullable().defaultTo(instance.fn.now());
    });
  }
  await instance('difficulty_levels')
    .insert(DIFFICULTY_LEVELS.map((difficulty) => ({
      key: difficulty.key,
      sort_order: difficulty.sortOrder,
      is_enabled: difficulty.isEnabled,
    })))
    .onConflict('key')
    .merge(['sort_order', 'is_enabled']);
  if (!(await instance.schema.hasTable('player_difficulties'))) {
    await instance.schema.createTable('player_difficulties', (t) => {
      t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
      t.string('difficulty_key', 32).notNullable().references('key').inTable('difficulty_levels').onDelete('CASCADE');
      t.primary(['player_id', 'difficulty_key']);
      t.index(['difficulty_key', 'player_id']);
    });
  }
  await backfillLegacyPlayerDifficulties(instance);
  if (await instance.schema.hasColumn('players', 'is_easy')) {
    await instance.schema.alterTable('players', (t) => t.dropColumn('is_easy'));
  }
  if (!(await instance.schema.hasColumn('games', 'first_guess_player_id'))) {
    await instance.schema.alterTable('games', (t) => t.integer('first_guess_player_id').nullable());
  }
  await backfillFirstGuessPlayerIds(instance);
  await instance.raw(
    'create unique index if not exists "games_session_id_unique" on "games" ("session_id")'
  );
  // Active single-player games now live only in Redis and are not historical records.
  await instance('games').where({ status: 'playing' }).del();

  if (
    (await instance.schema.hasTable('match_records')) &&
    !(await instance.schema.hasColumn('match_records', 'bo_type'))
  ) {
    await instance.schema.dropTable('match_records');
  }
  if (!(await instance.schema.hasTable('match_records'))) {
    await instance.schema.createTable('match_records', (t) => {
      t.increments('id').primary();
      t.string('room_id', 64).notNullable();
      t.string('db_type', 16).notNullable().defaultTo('easy');
      t.integer('bo_type').notNullable().defaultTo(3);
      t.integer('winner_id').nullable().references('id').inTable('users');
      t.string('winner_key', 80).nullable();
      t.string('finish_reason', 32).nullable();
      t.string('forfeited_key', 80).nullable();
      t.text('players').notNullable().defaultTo('[]');
      t.text('replay').notNullable().defaultTo('[]');
      t.timestamp('created_at').notNullable().defaultTo(instance.fn.now());
      t.unique(['room_id']);
    });
  }
  if (!(await instance.schema.hasColumn('match_records', 'replay'))) {
    await instance.schema.alterTable('match_records', (t) => {
      t.text('replay').notNullable().defaultTo('[]');
    });
  }
  if (!(await instance.schema.hasColumn('match_records', 'db_type'))) {
    await instance.schema.alterTable('match_records', (t) => {
      t.string('db_type', 16).notNullable().defaultTo('easy');
    });
  }
  if (!(await instance.schema.hasColumn('match_records', 'winner_key'))) {
    await instance.schema.alterTable('match_records', (t) => {
      t.string('winner_key', 80).nullable();
    });
  }
  if (!(await instance.schema.hasColumn('match_records', 'finish_reason'))) {
    await instance.schema.alterTable('match_records', (t) => {
      t.string('finish_reason', 32).nullable();
    });
  }
  if (!(await instance.schema.hasColumn('match_records', 'forfeited_key'))) {
    await instance.schema.alterTable('match_records', (t) => {
      t.string('forfeited_key', 80).nullable();
    });
  }

  if (!(await instance.schema.hasTable('match_players'))) {
    await instance.schema.createTable('match_players', (t) => {
      t.increments('id').primary();
      t.integer('match_id').notNullable().references('id').inTable('match_records').onDelete('CASCADE');
      t.integer('user_id').nullable().references('id').inTable('users');
      t.string('player_key', 80).notNullable();
      t.string('player_name', 32).notNullable().defaultTo('');
      t.integer('score').notNullable().defaultTo(0);
      t.boolean('is_winner').notNullable().defaultTo(false);
      t.integer('winning_guess_sum').notNullable().defaultTo(0);
      t.integer('winning_rounds').notNullable().defaultTo(0);
      t.unique(['match_id', 'player_key']);
      t.index(['user_id', 'is_winner'], 'match_players_user_winner_idx');
    });
  }
  if (!(await instance.schema.hasColumn('match_players', 'winning_guess_sum'))) {
    await instance.schema.alterTable('match_players', (t) => {
      t.integer('winning_guess_sum').notNullable().defaultTo(0);
    });
  }
  if (!(await instance.schema.hasColumn('match_players', 'winning_rounds'))) {
    await instance.schema.alterTable('match_players', (t) => {
      t.integer('winning_rounds').notNullable().defaultTo(0);
    });
  }

  if (instance.client.config.client === 'pg') {
    await instance.raw(
      'alter table "match_records" alter column "room_id" type varchar(64)'
    );
  }

  const matchPlayerCount = Number(
    (await instance('match_players').count<{ count: number }[]>({ count: '*' }))[0].count
  );
  if (matchPlayerCount === 0) {
    const legacyMatches = await instance('match_records').select('id', 'winner_id', 'players');
    for (const match of legacyMatches) {
      let players: { userId: number | null; name: string; score: number }[] = [];
      try {
        players = JSON.parse(match.players);
      } catch {
        continue;
      }
      if (players.length) {
        await instance('match_players').insert(
          players.map((player, index) => ({
            match_id: match.id,
            user_id: player.userId,
            player_key: player.userId != null ? `u:${player.userId}` : `legacy:${match.id}:${index}`,
            player_name: player.name,
            score: player.score,
            is_winner: player.userId != null && player.userId === match.winner_id,
          }))
        );
      }
    }
  }
  await backfillMultiWinningGuesses(instance);

  const gameIndexes = [
    ['games_user_status_mode_idx', ['user_id', 'status', 'mode']],
    ['games_guest_status_mode_idx', ['guest_key', 'status', 'mode']],
    ['games_user_finished_idx', ['user_id', 'finished_at']],
    ['games_guest_finished_idx', ['guest_key', 'finished_at']],
  ] as const;
  for (const [name, columns] of gameIndexes) {
    const quotedColumns = columns.map((column) => `\"${column}\"`).join(', ');
    await instance.raw(`create index if not exists \"${name}\" on \"games\" (${quotedColumns})`);
  }
  const firstGuessIndexes = [
    ['games_first_guess_idx', ['first_guess_player_id']],
    ['games_user_first_guess_idx', ['user_id', 'first_guess_player_id']],
    ['games_guest_first_guess_idx', ['guest_key', 'first_guess_player_id']],
  ] as const;
  for (const [name, columns] of firstGuessIndexes) {
    const quotedColumns = columns.map((column) => `\"${column}\"`).join(', ');
    const concurrently = instance.client.config.client === 'pg' ? ' concurrently' : '';
    await instance.raw(
      `create index${concurrently} if not exists \"${name}\" on \"games\" (${quotedColumns})`
    );
  }

  await instance.raw(
    'create unique index if not exists "match_records_room_id_unique" on "match_records" ("room_id")'
  );
  await instance.raw(
    'create index if not exists "match_records_created_at_idx" on "match_records" ("created_at", "id")'
  );
  await instance.raw(
    'create index if not exists "match_players_user_match_idx" on "match_players" ("user_id", "match_id")'
  );
  await instance.raw(
    'create index if not exists "match_players_key_match_idx" on "match_players" ("player_key", "match_id")'
  );

  if (!(await instance.schema.hasTable('announcements'))) {
    await instance.schema.createTable('announcements', (t) => {
      t.increments('id').primary();
      t.string('title', 128).notNullable();
      t.text('content').notNullable();
      t.boolean('is_popup').notNullable().defaultTo(false);
      t.timestamp('created_at').notNullable().defaultTo(instance.fn.now());
    });
  }
  if (!(await instance.schema.hasColumn('announcements', 'is_popup'))) {
    await instance.schema.alterTable('announcements', (t) => {
      t.boolean('is_popup').notNullable().defaultTo(false);
    });
  }

}
