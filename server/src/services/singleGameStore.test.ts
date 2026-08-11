import { describe, expect, it } from 'vitest';
import {
  createOrResumeSingleGame,
  deleteSingleGame,
  loadSingleGame,
  saveSingleGame,
} from './singleGameStore';

describe('singleGameStore', () => {
  it('uses the bounded in-memory store when Redis is unavailable', async () => {
    const created = await createOrResumeSingleGame({
      identityKey: 'g:test',
      userId: null,
      guestKey: 'test-guest',
      mode: 'easy',
      targetPlayerId: 1,
    });
    expect(await loadSingleGame(created.id, 'g:test')).toBe(created);
    await deleteSingleGame(created);
    expect(await loadSingleGame(created.id, 'g:test')).toBeNull();
  });

  it('restores the same active game and guesses until it is explicitly deleted', async () => {
    const identityKey = `g:single-resume-${Date.now()}`;
    const created = await createOrResumeSingleGame({
      identityKey,
      userId: null,
      guestKey: identityKey.slice(2),
      mode: 'easy',
      targetPlayerId: 1,
    });
    created.guesses.push({ playerId: 2, nickname: 'test' } as any);
    await saveSingleGame(created);

    const restored = await createOrResumeSingleGame({
      identityKey,
      userId: null,
      guestKey: identityKey.slice(2),
      mode: 'easy',
      targetPlayerId: 3,
    });
    expect(restored.id).toBe(created.id);
    expect(restored.targetPlayerId).toBe(1);
    expect(restored.guesses).toEqual(created.guesses);
    expect(restored.guessTimes).toEqual([null]);

    await deleteSingleGame(restored);
    expect(await loadSingleGame(restored.id, identityKey)).toBeNull();
  });

  it('removes legacy games once last activity is older than thirty minutes', async () => {
    const identityKey = `g:single-stale-${Date.now()}`;
    const created = await createOrResumeSingleGame({
      identityKey,
      userId: null,
      guestKey: identityKey.slice(2),
      mode: 'normal',
      targetPlayerId: 1,
    });
    created.lastActiveAt = Date.now() - 1_801_000;
    expect(await loadSingleGame(created.id, identityKey)).toBeNull();
  });

  it('aligns missing legacy timing data with stored guesses', async () => {
    const identityKey = `g:single-legacy-times-${Date.now()}`;
    const created = await createOrResumeSingleGame({
      identityKey,
      userId: null,
      guestKey: identityKey.slice(2),
      mode: 'normal',
      targetPlayerId: 1,
    });
    created.guesses.push({ playerId: 2, nickname: 'test' } as any);
    (created as any).guessTimes = undefined;
    try {
      const restored = await loadSingleGame(created.id, identityKey);
      expect(restored?.guessTimes).toEqual([null]);
    } finally {
      const restored = await loadSingleGame(created.id, identityKey);
      if (restored) await deleteSingleGame(restored);
    }
  });
});
