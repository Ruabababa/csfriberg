import type { Knex } from 'knex';
import { z } from 'zod';
import { db } from '../db/knex';
import { isKnownDifficultyKey } from '../difficulties';
import { HttpError } from '../middleware/common';
import { invalidatePlayerCache } from './playerCache';
import { normalizeR6Region, normalizeR6Role } from '../config/r6DataPolicy';
import { competitionRegionsForNationality } from '../config/r6CompetitionRegions';

const roleSchema = z.string().trim().min(1).max(64);
const difficultyKeySchema = z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/);
const difficultyListSchema = z.array(difficultyKeySchema)
  .min(1)
  .max(20)
  .refine((keys) => new Set(keys).size === keys.length);

const playerFields = {
  nickname: z.string().trim().min(1).max(64),
  nationality: z.string().trim().min(1).max(64),
  region: z.string().trim().max(32).default(''),
  team: z.string().trim().max(64).default(''),
  age: z.number().int().min(10).max(100),
  role: roleSchema.default('Entry'),
  roles: z.array(roleSchema).min(1).max(8).optional(),
  major_championships: z.number().int().min(0).default(0),
  major_appearances: z.number().int().min(0).default(0),
  major_si_championships: z.number().int().min(0).optional(),
  major_si_appearances: z.number().int().min(0).optional(),
  birth_date: z.string().date().nullable().optional(),
  source_url: z.string().url().max(512).nullable().optional(),
  source_provider: z.literal('liquipedia').nullable().optional(),
  source_player_id: z.string().trim().min(1).max(256).nullable().optional(),
  source_updated_at: z.string().datetime({ offset: true }).nullable().optional(),
  data_version: z.string().trim().max(64).nullable().optional(),
  major_si_event_ids: z.array(z.string().trim().min(1).max(256)).max(100).optional(),
  major_si_championship_event_ids: z.array(z.string().trim().min(1).max(256)).max(100).optional(),
  is_active: z.boolean().default(true),
  is_enabled: z.boolean().default(true),
  difficulties: difficultyListSchema.optional(),
};

function validateR6Player(values: Record<string, unknown>, context: z.RefinementCtx): void {
  const championships = values.major_si_championships ?? values.major_championships;
  const appearances = values.major_si_appearances ?? values.major_appearances;
  if (championships !== undefined && appearances !== undefined
    && Number(championships) > Number(appearances)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['major_si_championships'], message: 'CHAMPIONSHIPS_EXCEED_APPEARANCES' });
  }
  const eventIds = values.major_si_event_ids as string[] | undefined;
  const championshipEventIds = values.major_si_championship_event_ids as string[] | undefined;
  if (eventIds && new Set(eventIds).size !== eventIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['major_si_event_ids'], message: 'DUPLICATE_EVENT_ID' });
  }
  if (championshipEventIds && new Set(championshipEventIds).size !== championshipEventIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['major_si_championship_event_ids'], message: 'DUPLICATE_CHAMPIONSHIP_EVENT_ID' });
  }
  if (eventIds && championshipEventIds) {
    const appearancesSet = new Set(eventIds);
    if (championshipEventIds.some((eventId) => !appearancesSet.has(eventId))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['major_si_championship_event_ids'], message: 'CHAMPIONSHIP_EVENT_NOT_IN_APPEARANCES' });
    }
  }
  const provider = values.source_provider;
  const sourceId = values.source_player_id;
  if ((provider == null) !== (sourceId == null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['source_player_id'], message: 'SOURCE_IDENTITY_INCOMPLETE' });
  }
  if (provider === 'liquipedia') {
    const nationalityRegions = competitionRegionsForNationality(String(values.nationality ?? ''));
    const region = String(values.region ?? '').trim();
    if (!normalizeR6Region(region) && !(region === '' && nationalityRegions.size > 1)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['region'], message: 'UNKNOWN_REGION' });
    }
    if (appearances !== undefined && Number(appearances) < 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['major_si_appearances'], message: 'NO_MAJOR_SI_APPEARANCE' });
    }
  }
  const roles = values.roles as string[] | undefined;
  if (roles?.some((role) => normalizeR6Role(role) === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['roles'], message: 'UNKNOWN_ROLE' });
  }
  if (values.role !== undefined && normalizeR6Role(String(values.role)) === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['role'], message: 'UNKNOWN_ROLE' });
  }
  if (provider === 'liquipedia'
    && competitionRegionsForNationality(String(values.nationality ?? '')).size === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['nationality'], message: 'INVALID_COUNTRY_CODE' });
  }
}

const playerObjectSchema = z.object(playerFields);
export const playerSchema = playerObjectSchema.superRefine(validateR6Player);

export const importedPlayerSchema = playerObjectSchema.extend({
  is_enabled: z.boolean().optional(),
  // Legacy import alias; it is converted to difficulty memberships and never persisted.
  is_easy: z.boolean().optional(),
}).superRefine(validateR6Player);

export const playerUpdateSchema = playerObjectSchema.partial()
  .refine((values) => Object.keys(values).length > 0)
  .superRefine(validateR6Player);

export const playerImportSchema = z.object({
  players: z.array(importedPlayerSchema)
    .min(1)
    .max(1000)
    .refine((players) => {
      const identities = players.map((player) => player.source_provider && player.source_player_id
        ? `${player.source_provider}:${player.source_player_id}`
        : `nickname:${player.nickname.toLocaleLowerCase('en-US')}`);
      return new Set(identities).size === identities.length;
    }),
});

export type PlayerInput = z.infer<typeof playerSchema>;
export type PlayerUpdateInput = z.infer<typeof playerUpdateSchema>;
export type ImportedPlayerInput = z.infer<typeof importedPlayerSchema>;

type PlayerMutationInput = PlayerInput | PlayerUpdateInput | ImportedPlayerInput;

function normalizePlayerValues(input: PlayerMutationInput, includeDefaults: boolean): Record<string, unknown> {
  const {
    difficulties: _difficulties,
    is_easy: _isEasy,
    role,
    roles,
    major_championships,
    major_appearances,
    major_si_championships,
    major_si_appearances,
    major_si_event_ids,
    major_si_championship_event_ids,
    ...rest
  } = input as Record<string, unknown>;
  const hasChampionships = major_si_championships !== undefined || major_championships !== undefined;
  const hasAppearances = major_si_appearances !== undefined || major_appearances !== undefined;
  const values: Record<string, unknown> = { ...rest };
  if (hasChampionships || includeDefaults) {
    const championships = Number(major_si_championships ?? major_championships ?? 0);
    values.major_si_championships = championships;
    values.major_championships = championships;
  }
  if (hasAppearances || includeDefaults) {
    const appearances = Number(major_si_appearances ?? major_appearances ?? 0);
    values.major_si_appearances = appearances;
    values.major_appearances = appearances;
  }
  if (roles !== undefined || role !== undefined || includeDefaults) {
    const roleList = [...new Set(((roles as string[] | undefined) ?? [String(role ?? 'Entry')])
      .map((value) => normalizeR6Role(value) ?? value))];
    values.roles = JSON.stringify(roleList);
    values.role = roleList[0] ?? 'Entry';
  }
  if (major_si_event_ids !== undefined) values.major_si_event_ids = JSON.stringify(major_si_event_ids);
  if (major_si_championship_event_ids !== undefined) {
    values.major_si_championship_event_ids = JSON.stringify(major_si_championship_event_ids);
  }
  return values;
}

function assertDifficultyKeys(keys: string[]): void {
  const unique = [...new Set(keys)];
  if (unique.some((key) => !isKnownDifficultyKey(key))) {
    throw new HttpError(400, 'INVALID_DIFFICULTY');
  }
}

async function replacePlayerDifficulties(
  executor: Knex | Knex.Transaction,
  playerId: number,
  keys: string[]
): Promise<void> {
  const unique = [...new Set(keys)];
  await executor('player_difficulties').where({ player_id: playerId }).del();
  if (unique.length) {
    await executor('player_difficulties').insert(
      unique.map((key) => ({ player_id: playerId, difficulty_key: key }))
    );
  }
}

export async function createPlayer(input: PlayerInput): Promise<number> {
  const exists = input.source_provider && input.source_player_id
    ? await db('players').where({
      source_provider: input.source_provider,
      source_player_id: input.source_player_id,
    }).first('id')
    : await db('players').where({ nickname: input.nickname }).whereNull('source_provider').first('id');
  if (exists) throw new HttpError(409, input.source_provider ? 'SOURCE_PLAYER_TAKEN' : 'NICKNAME_TAKEN');
  const difficulties = input.difficulties ?? ['normal'];
  assertDifficultyKeys(difficulties);
  const values = normalizePlayerValues(input, true);
  const id = await db.transaction(async (trx) => {
    const [createdId] = await trx('players')
      .insert(values)
      .returning('id')
      .then((rows) => rows.map((row: unknown) => (
        typeof row === 'object' && row !== null && 'id' in row ? row.id : row
      )));
    const playerId = Number(createdId);
    await replacePlayerDifficulties(trx, playerId, difficulties);
    return playerId;
  });
  await invalidatePlayerCache();
  return id;
}

export async function updatePlayer(id: number, input: PlayerUpdateInput): Promise<void> {
  const difficulties = input.difficulties;
  const values = normalizePlayerValues(input, false);
  if (difficulties) assertDifficultyKeys(difficulties);
  await db.transaction(async (trx) => {
    const exists = await trx('players').where({ id }).first('id');
    if (!exists) throw new HttpError(404, 'PLAYER_NOT_FOUND');
    if (Object.keys(values).length) await trx('players').where({ id }).update(values);
    if (difficulties) await replacePlayerDifficulties(trx, id, difficulties);
  });
  await invalidatePlayerCache();
}

export async function deletePlayer(id: number): Promise<void> {
  const player = await db('players').where({ id }).first('id', 'is_enabled');
  if (!player) throw new HttpError(404, 'PLAYER_NOT_FOUND');
  if (Boolean(player.is_enabled)) throw new HttpError(409, 'PLAYER_MUST_BE_DISABLED');
  const used = await db('games').where({ target_player_id: id }).first('id');
  if (used) throw new HttpError(409, 'PLAYER_HAS_HISTORY');
  const count = await db('players').where({ id }).del();
  if (!count) throw new HttpError(404, 'PLAYER_NOT_FOUND');
  await invalidatePlayerCache();
}

export async function importPlayers(
  players: ImportedPlayerInput[]
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  await db.transaction(async (trx) => {
    for (const player of players) {
      const existing = player.source_provider && player.source_player_id
        ? await trx('players').where({
          source_provider: player.source_provider,
          source_player_id: player.source_player_id,
        }).first('id', 'is_enabled')
        : await trx('players')
          .where({ nickname: player.nickname })
          .whereNull('source_provider')
          .first('id', 'is_enabled');
      const { difficulties, is_easy } = player;
      const values = normalizePlayerValues(player, !existing);
      const desired = difficulties
        ?? (is_easy !== undefined
          ? [
            'normal',
            ...(is_easy ? ['easy'] : []),
            ...(is_easy && Number(player.major_si_championships ?? player.major_championships ?? 0) > 0
              ? ['beginner']
              : []),
          ]
          : null)
        ?? (existing ? null : ['normal']);
      if (desired) assertDifficultyKeys(desired);
      const savedValues = {
        ...values,
        is_enabled: player.is_enabled ?? Boolean(existing?.is_enabled ?? true),
      };
      let playerId: number;
      if (existing) {
        playerId = Number(existing.id);
        await trx('players').where({ id: playerId }).update(savedValues);
        updated += 1;
      } else {
        const [inserted] = await trx('players').insert(savedValues).returning('id');
        playerId = Number(typeof inserted === 'object' ? inserted.id : inserted);
        created += 1;
      }
      if (desired) {
        await replacePlayerDifficulties(trx, playerId, desired);
      }
    }
  });
  await invalidatePlayerCache();
  return { created, updated };
}
