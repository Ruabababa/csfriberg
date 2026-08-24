import type { Knex } from 'knex';
import crypto from 'crypto';
import { competitionRegionForNationality } from '../config/r6CompetitionRegions';
import { normalizeR6Role } from '../config/r6DataPolicy';
import { db } from './knex';
import playersData from './seeds/players.json';

interface SeedPlayer {
  player_id: string;
  nickname: string;
  age: number | null;
  birth_date: string | null;
  country_region: string | null;
  current_team: string | null;
  role_raw: string | null;
  status_raw: string | null;
  major_appearances: number;
  major_wins: number;
  si_appearances: number;
  si_wins: number;
  liquipedia_url: string;
  scraped_at: string;
}

const seedPlayers = playersData as SeedPlayer[];
export const FIXED_SEED_PLAYER_COUNT = 81;

export interface FixedSeedSummary {
  players: number;
  playerIdSha256: string;
  sourceProvider: 'liquipedia';
  sourceUpdatedAt: { earliest: string; latest: string };
}

export function validateSeedPlayers(data: unknown = playersData): asserts data is SeedPlayer[] {
  if (!Array.isArray(data) || data.length !== FIXED_SEED_PLAYER_COUNT) {
    throw new Error(`FIXED_SEED_COUNT_MUST_BE_${FIXED_SEED_PLAYER_COUNT}`);
  }
  const ids = new Set<string>();
  for (const player of data) {
    if (!player || typeof player !== 'object') throw new Error('INVALID_SEED_PLAYER');
    const row = player as SeedPlayer;
    if (!row.player_id?.trim() || ids.has(row.player_id)) throw new Error('SEED_PLAYER_ID_MUST_BE_UNIQUE');
    ids.add(row.player_id);
    if (!row.nickname?.trim() || !row.country_region?.trim() || !row.current_team?.trim()) {
      throw new Error(`SEED_PLAYER_REQUIRED_FIELD_MISSING:${row.player_id}`);
    }
    if (!Number.isInteger(row.major_appearances) || !Number.isInteger(row.major_wins) ||
      !Number.isInteger(row.si_appearances) || !Number.isInteger(row.si_wins) ||
      row.major_appearances < 0 || row.major_wins < 0 || row.si_appearances < 0 || row.si_wins < 0 ||
      row.major_wins > row.major_appearances || row.si_wins > row.si_appearances) {
      throw new Error(`SEED_PLAYER_STATS_INVALID:${row.player_id}`);
    }
    if (!row.birth_date || !row.status_raw || !row.liquipedia_url || !row.scraped_at) {
      throw new Error(`SEED_PLAYER_METADATA_MISSING:${row.player_id}`);
    }
  }
}

export function fixedSeedSummary(data: unknown = playersData): FixedSeedSummary {
  validateSeedPlayers(data);
  const players = data as SeedPlayer[];
  const sourceDates = players.map((player) => player.scraped_at).sort();
  return {
    players: players.length,
    playerIdSha256: crypto
      .createHash('sha256')
      .update(players.map((player) => player.player_id).sort().join('\n'))
      .digest('hex'),
    sourceProvider: 'liquipedia',
    sourceUpdatedAt: {
      earliest: sourceDates[0]!,
      latest: sourceDates.at(-1)!,
    },
  };
}

export interface SeedSyncResult {
  created: number;
  updated: number;
  disabled: number;
}

function difficulties(player: SeedPlayer): string[] {
  const champion = player.major_wins + player.si_wins > 0;
  return champion ? ['normal', 'easy', 'beginner'] : ['normal'];
}

function playerRoles(player: SeedPlayer): string[] {
  const raw = (player.role_raw ?? '')
    .replace(/in[- ]game leader/gi, '/IGL/')
    .replace(/entry fragger/gi, '/Entry/')
    .replace(/(support|flex|entry|fragger|roamer|anchor|lurker)/gi, '/$1/');
  const roles = raw
    .split(/\s*[/,|]\s*/)
    .map((role) => normalizeR6Role(role))
    .filter((role) => role !== null);
  return [...new Set(roles.length ? roles : ['Entry'])];
}

const UPDATED_COLUMNS = [
  'nickname',
  'nationality',
  'region',
  'team',
  'age',
  'role',
  'roles',
  'major_championships',
  'major_appearances',
  'si_championships',
  'si_appearances',
  'major_si_championships',
  'major_si_appearances',
  'birth_date',
  'source_url',
  'source_updated_at',
  'data_version',
  'status_raw',
  'is_active',
] as const;

function seedRow(player: SeedPlayer) {
  const roles = playerRoles(player);
  return {
    nickname: player.nickname,
    nationality: player.country_region ?? '',
    region: competitionRegionForNationality(player.country_region) ?? '',
    team: player.current_team ?? '',
    age: player.age,
    role: roles[0] ?? '',
    roles: JSON.stringify(roles),
    major_championships: player.major_wins,
    major_appearances: player.major_appearances,
    si_championships: player.si_wins,
    si_appearances: player.si_appearances,
    major_si_championships: player.major_wins + player.si_wins,
    major_si_appearances: player.major_appearances + player.si_appearances,
    birth_date: player.birth_date,
    source_url: player.liquipedia_url,
    source_provider: 'liquipedia',
    source_player_id: player.player_id,
    source_updated_at: player.scraped_at,
    data_version: player.scraped_at.slice(0, 10),
    status_raw: player.status_raw,
    is_active: player.status_raw?.toLocaleLowerCase('en-US') === 'active',
  };
}

export async function syncSeedPlayers(instance: Knex = db): Promise<SeedSyncResult> {
  validateSeedPlayers();
  const rows = seedPlayers.map(seedRow);
  const seedIds = new Set(seedPlayers.map((player) => player.player_id));
  const seedById = new Map(seedPlayers.map((player) => [player.player_id, player]));
  const existingOfficial = await instance('players')
    .where({ source_provider: 'liquipedia' })
    .select('id', 'source_player_id', 'is_enabled');
  const existingIds = new Set(existingOfficial.map((player) => String(player.source_player_id)));
  const missing = existingOfficial.filter((player) => !seedIds.has(String(player.source_player_id)));
  const legacyEnabled = await instance('players')
    .whereNull('source_provider')
    .where({ is_enabled: true })
    .select('id');
  const existingEnabledById = new Map(
    existingOfficial.map((player) => [String(player.source_player_id), Boolean(player.is_enabled)])
  );

  await instance.transaction(async (trx) => {
    if (legacyEnabled.length) {
      const legacyIds = legacyEnabled.map((player) => Number(player.id));
      await trx('players').whereIn('id', legacyIds).update({ is_enabled: false });
      await trx('player_difficulties').whereIn('player_id', legacyIds).del();
    }
    if (missing.length) {
      const missingIds = missing.map((player) => Number(player.id));
      await trx('players').whereIn('id', missingIds).update({ is_enabled: false });
      await trx('player_difficulties').whereIn('player_id', missingIds).del();
    }

    for (let index = 0; index < rows.length; index += 250) {
      const batch = rows.slice(index, index + 250).map((row) => ({
        ...row,
        is_enabled: existingEnabledById.get(row.source_player_id) ?? true,
      }));
      await trx('players')
        .insert(batch)
        .onConflict(['source_provider', 'source_player_id'])
        .merge([...UPDATED_COLUMNS]);
    }

    const synced = await trx('players')
      .where({ source_provider: 'liquipedia' })
      .whereIn('source_player_id', [...seedIds])
      .select('id', 'source_player_id');
    if (synced.length !== FIXED_SEED_PLAYER_COUNT) {
      throw new Error('FIXED_SEED_IMPORT_INCOMPLETE:' + synced.length);
    }
    const syncedIds = synced
      .filter((player) => existingEnabledById.get(String(player.source_player_id)) !== false)
      .map((player) => Number(player.id));
    if (syncedIds.length) {
      await trx('player_difficulties').whereIn('player_id', syncedIds).del();
    }
    const memberships = synced.flatMap((player) => {
      if (existingEnabledById.get(String(player.source_player_id)) === false) return [];
      const seed = seedById.get(String(player.source_player_id));
      return seed
        ? difficulties(seed).map((difficultyKey) => ({
            player_id: Number(player.id),
            difficulty_key: difficultyKey,
          }))
        : [];
    });
    for (let index = 0; index < memberships.length; index += 250) {
      await trx('player_difficulties').insert(memberships.slice(index, index + 250));
    }
  });

  return {
    created: seedPlayers.filter((player) => !existingIds.has(player.player_id)).length,
    updated: seedPlayers.filter((player) => existingIds.has(player.player_id)).length,
    disabled: missing.filter((player) => Boolean(player.is_enabled)).length + legacyEnabled.length,
  };
}

export async function insertMissingSeedPlayers(instance: Knex = db): Promise<number> {
  return (await syncSeedPlayers(instance)).created;
}

export async function seedPlayersIfEmpty(instance: Knex = db): Promise<number> {
  const row = await instance('players').count<{ count: number | string }[]>({ count: '*' });
  if (Number(row[0]?.count ?? 0) > 0) return 0;
  return insertMissingSeedPlayers(instance);
}
