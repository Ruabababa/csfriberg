import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initRedis, redis, redisKey } from '../redis';
import { db } from '../db/knex';
import { ensureSchema } from '../db/schema';
import {
  getPublicPlayerList,
  isDifficultyAvailable,
  invalidatePlayerCache,
  pickCachedTarget,
  refreshPlayerCache,
} from './playerCache';

beforeAll(async () => {
  await ensureSchema();
  await initRedis();
});

afterAll(async () => {
  await db('players').whereLike('nickname', 'cache-test-%').del();
});

describe('player cache invalidation', () => {
  it('does not increment the legacy SHA version key', async () => {
    const client = redis()!;
    await client.set(redisKey('players:version'), '0123456789abcdef');
    await client.del(redisKey('players:revision:v2'));
    await expect(invalidatePlayerCache()).resolves.toBeUndefined();
    expect(await client.get(redisKey('players:version'))).toBe('0123456789abcdef');
    expect(await client.get(redisKey('players:revision:v2'))).toBe('1');
  });

  it('removes a disabled player before invalidation returns and changes the list version', async () => {
    const nickname = `cache-test-${Date.now()}`;
    const [row] = await db('players').insert({
      nickname,
      nationality: 'FR',
      region: 'Europe',
      team: 'Fixture Team',
      age: 26,
      role: 'Entry',
      major_championships: 0,
      major_appearances: 0,
      is_active: true,
      is_enabled: true,
    }).returning('id');
    const id = typeof row === 'object' ? row.id : row;

    await refreshPlayerCache();
    const before = await getPublicPlayerList();
    expect(before.players).toContainEqual({ id, nickname, team: 'Fixture Team', nationality: 'FR' });

    await db('players').where({ id }).update({ is_enabled: false });
    await invalidatePlayerCache();

    const after = await getPublicPlayerList();
    expect(after.version).not.toBe(before.version);
    expect(after.players).not.toContainEqual(expect.objectContaining({ id, nickname }));
  });

  it('refreshes a stale instance before serving the public list', async () => {
    const nickname = `cache-test-cross-instance-${Date.now()}`;
    const [row] = await db('players').insert({
      nickname,
      nationality: 'CA',
      region: 'North America',
      team: 'Fixture Team',
      age: 26,
      role: 'Flex',
      major_championships: 0,
      major_appearances: 0,
      is_active: true,
      is_enabled: true,
    }).returning('id');
    const id = typeof row === 'object' ? row.id : row;

    await refreshPlayerCache();
    expect((await getPublicPlayerList()).players).toContainEqual({
      id,
      nickname,
      team: 'Fixture Team',
      nationality: 'CA',
    });

    await db('players').where({ id }).update({ is_enabled: false });
    await redis()!.incr(redisKey('players:revision:v2'));

    expect((await getPublicPlayerList()).players).not.toContainEqual(expect.objectContaining({ id, nickname }));
  });

  it('serves targets from the beginner difficulty pool', async () => {
    const nickname = `cache-test-beginner-${Date.now()}`;
    const [row] = await db('players').insert({
      nickname,
      nationality: 'BR',
      region: 'Brazil',
      team: 'Fixture Champions',
      age: 26,
      role: 'Support',
      major_championships: 1,
      major_appearances: 1,
      is_active: true,
      is_enabled: true,
    }).returning('id');
    const id = typeof row === 'object' ? row.id : row;
    await db('player_difficulties').insert({ player_id: id, difficulty_key: 'beginner' });

    await refreshPlayerCache();

    expect(isDifficultyAvailable('beginner')).toBe(true);
    expect(pickCachedTarget('beginner')?.difficulties).toContain('beginner');
  });
});
