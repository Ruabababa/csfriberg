import knex from 'knex';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureSchema } from './schema';
import playersData from './seeds/players.json';
import {
  FIXED_SEED_PLAYER_COUNT,
  fixedSeedSummary,
  insertMissingSeedPlayers,
  syncSeedPlayers,
  validateSeedPlayers,
} from './seedPlayers';

const instances: ReturnType<typeof knex>[] = [];

afterEach(async () => {
  await Promise.all(instances.splice(0).map((instance) => instance.destroy()));
});

describe('fixed player seeds', () => {
  it('validates the fixed 81-player snapshot and provides an auditable summary', () => {
    expect(() => validateSeedPlayers()).not.toThrow();
    expect(fixedSeedSummary()).toMatchObject({
      players: FIXED_SEED_PLAYER_COUNT,
      sourceProvider: 'liquipedia',
      playerIdSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it('rejects an invalid player count, duplicate identity, missing data, and invalid statistics', () => {
    const missing = structuredClone(playersData).slice(1);
    expect(() => validateSeedPlayers(missing)).toThrow('FIXED_SEED_COUNT_MUST_BE_81');

    const duplicate = structuredClone(playersData);
    duplicate[1]!.player_id = duplicate[0]!.player_id;
    expect(() => validateSeedPlayers(duplicate)).toThrow('SEED_PLAYER_ID_MUST_BE_UNIQUE');

    const incomplete = structuredClone(playersData);
    incomplete[0]!.nickname = '';
    expect(() => validateSeedPlayers(incomplete)).toThrow('SEED_PLAYER_REQUIRED_FIELD_MISSING');

    const impossible = structuredClone(playersData);
    impossible[0]!.major_wins = impossible[0]!.major_appearances + 1;
    expect(() => validateSeedPlayers(impossible)).toThrow('SEED_PLAYER_STATS_INVALID');
  });

  it('imports all fixed players once with their expected difficulty memberships', async () => {
    const instance = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    instances.push(instance);
    await ensureSchema(instance);

    expect(await insertMissingSeedPlayers(instance)).toBe(FIXED_SEED_PLAYER_COUNT);
    expect(await insertMissingSeedPlayers(instance)).toBe(0);
    expect(Number((await instance('players').count({ count: '*' }).first())?.count))
      .toBe(FIXED_SEED_PLAYER_COUNT);
    expect(Number((await instance('players').where({ is_enabled: true }).count({ count: '*' }).first())?.count))
      .toBe(FIXED_SEED_PLAYER_COUNT);
    for (const seed of playersData) {
      const player = await instance('players').where({ source_player_id: seed.player_id }).first('id');
      const memberships = await instance('player_difficulties')
        .where({ player_id: player.id })
        .pluck('difficulty_key');
      const expected = seed.major_wins + seed.si_wins > 0
        ? ['beginner', 'easy', 'normal']
        : ['normal'];
      expect(memberships.sort()).toEqual(expected);
    }
    const alem4o = await instance('players').where({ source_player_id: 'Alem4o' }).first();
    expect(alem4o).toMatchObject({
      nickname: 'Alem4o',
      nationality: 'Brazil',
      region: 'SAL',
      major_appearances: 11,
      major_championships: 1,
      si_appearances: 6,
      si_championships: 1,
      status_raw: 'Active',
    });
    const laxing = await instance('players').where({ source_player_id: 'LaXInG' }).first();
    expect(laxing).toMatchObject({ role: 'Support' });
    expect(JSON.parse(laxing.roles)).toEqual(['Support', 'Flex']);
    const renshiro = await instance('players').where({ source_player_id: 'Renshiro' }).first();
    expect(renshiro).toMatchObject({ role: 'Entry' });
    expect(JSON.parse(renshiro.roles)).toEqual(['Entry', 'Flex']);
  });

  it('updates existing crawler rows and disables source ids removed from the snapshot', async () => {
    const instance = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    instances.push(instance);
    await ensureSchema(instance);
    await insertMissingSeedPlayers(instance);
    await instance('players').where({ source_player_id: 'Alem4o' }).update({
      team: 'Outdated Team',
      region: '',
    });
    await instance('players').where({ source_player_id: 'Canadian' }).update({ is_enabled: false });
    const disabledCanadian = await instance('players').where({ source_player_id: 'Canadian' }).first('id');
    await instance('player_difficulties').where({ player_id: disabledCanadian.id }).del();
    await instance('players').insert({
      nickname: 'Old Source Id',
      nationality: '',
      region: '',
      team: '',
      age: null,
      role: '',
      major_championships: 0,
      major_appearances: 1,
      is_active: false,
      is_enabled: true,
      source_provider: 'liquipedia',
      source_player_id: 'removed-source-id',
    });

    expect(await syncSeedPlayers(instance)).toEqual({ created: 0, updated: 81, disabled: 1 });
    expect(await instance('players').where({ source_player_id: 'Alem4o' }).first()).toMatchObject({
      team: 'G2 Esports',
      region: 'SAL',
    });
    expect(await instance('players').where({ source_player_id: 'removed-source-id' }).first())
      .toMatchObject({ is_enabled: 0 });
    expect(await instance('players').where({ source_player_id: 'Canadian' }).first())
      .toMatchObject({ is_enabled: 0 });
    expect(await instance('player_difficulties').where({ player_id: disabledCanadian.id })).toEqual([]);
  });
});
