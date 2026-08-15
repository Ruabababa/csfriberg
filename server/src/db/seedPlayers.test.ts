import knex from 'knex';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureSchema } from './schema';
import { insertMissingSeedPlayers, syncSeedPlayers } from './seedPlayers';

const instances: ReturnType<typeof knex>[] = [];

afterEach(async () => {
  await Promise.all(instances.splice(0).map((instance) => instance.destroy()));
});

describe('Liquipedia player seeds', () => {
  it('loads every crawler export exactly once', async () => {
    const instance = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    instances.push(instance);
    await ensureSchema(instance);

    expect(await insertMissingSeedPlayers(instance)).toBe(81);
    expect(await insertMissingSeedPlayers(instance)).toBe(0);
    expect(Number((await instance('players').count({ count: '*' }).first())?.count)).toBe(81);
    for (const difficulty of ['beginner', 'easy', 'normal']) {
      expect(Number((await instance('player_difficulties')
        .where({ difficulty_key: difficulty })
        .count({ count: '*' })
        .first())?.count)).toBe(81);
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
