import knex from 'knex';
import { afterEach, describe, expect, it } from 'vitest';
import fixture from './fixtures/snapshot.json';
import { ensureSchema } from '../db/schema';
import { applyR6Players } from './apply';
import { normalizeR6Snapshot } from './normalize';

const instances: ReturnType<typeof knex>[] = [];

afterEach(async () => {
  await Promise.all(instances.splice(0).map((instance) => instance.destroy()));
});

function database() {
  const instance = knex({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
  });
  instances.push(instance);
  return instance;
}

describe('R6 snapshot apply', () => {
  it('imports R6 players, assigns pools, and disables legacy rows on a full sync', async () => {
    const instance = database();
    await ensureSchema(instance);
    await instance('players').insert({
      nickname: 'legacy-cs-player',
      nationality: 'SE',
      region: 'EML',
      age: 30,
      role: 'Entry',
      major_championships: 1,
      major_appearances: 2,
      is_enabled: true,
    });
    const legacy = await instance('players').where({ nickname: 'legacy-cs-player' }).first('id');
    await instance('games').insert({
      session_id: 'legacy-history',
      target_player_id: legacy.id,
      mode: 'normal',
      guesses: '[]',
      status: 'lost',
      guess_count: 0,
    });
    const normalized = normalizeR6Snapshot(fixture);
    const result = await applyR6Players({ players: normalized.players, fullSync: true }, instance);
    expect(result).toEqual({ created: 3, updated: 0, disabled: 1 });
    expect((await instance('players').where({ nickname: 'legacy-cs-player' }).first()).is_enabled).toBe(0);
    expect(await instance('games').where({ session_id: 'legacy-history' }).first()).toMatchObject({
      target_player_id: legacy.id,
    });

    const alpha = await instance('players').where({ source_player_id: 'fixture-alpha' }).first();
    expect(alpha).toMatchObject({
      nickname: 'R6Alpha',
      nationality: 'FR',
      region: 'EML',
      major_si_championships: 1,
      major_si_appearances: 2,
    });
    expect(await instance('player_difficulties')
      .where({ player_id: alpha.id })
      .orderBy('difficulty_key')
      .pluck('difficulty_key'))
      .toEqual(['beginner', 'easy', 'normal']);
  });

  it('updates by stable source ID and permits duplicate nicknames', async () => {
    const instance = database();
    await ensureSchema(instance);
    const normalized = normalizeR6Snapshot(fixture);
    await applyR6Players({ players: normalized.players, fullSync: false }, instance);

    const changed = normalized.players.map((player) => ({ ...player }));
    changed[0] = { ...changed[0], nickname: 'SharedNickname' };
    changed[1] = { ...changed[1], nickname: 'SharedNickname' };
    const result = await applyR6Players({ players: changed, fullSync: false }, instance);
    expect(result).toEqual({ created: 0, updated: 3, disabled: 0 });
    expect(await instance('players').where({ nickname: 'SharedNickname' }).count({ count: '*' }))
      .toEqual([{ count: 2 }]);
  });

  it('does not disable missing players during a partial sync', async () => {
    const instance = database();
    await ensureSchema(instance);
    const normalized = normalizeR6Snapshot(fixture);
    await applyR6Players({ players: normalized.players, fullSync: true }, instance);
    const result = await applyR6Players({ players: normalized.players.slice(0, 1), fullSync: false }, instance);
    expect(result).toEqual({ created: 0, updated: 1, disabled: 0 });
    expect(await instance('players').where({ is_enabled: true }).count({ count: '*' }))
      .toEqual([{ count: 3 }]);
  });

  it('rolls back the whole import when a later membership write fails', async () => {
    const instance = database();
    await ensureSchema(instance);
    await instance.raw('pragma foreign_keys = on');
    const normalized = normalizeR6Snapshot(fixture);
    const invalid = normalized.players.map((player) => ({ ...player, difficulties: [...player.difficulties] }));
    invalid[1].difficulties = ['normal', 'missing-difficulty'] as typeof invalid[1]['difficulties'];
    await expect(applyR6Players({ players: invalid, fullSync: false }, instance)).rejects.toThrow();
    expect(await instance('players').count({ count: '*' })).toEqual([{ count: 0 }]);
  });
});
