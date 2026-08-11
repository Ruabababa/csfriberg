import { randomUUID } from 'crypto';
import { evalCommandScript, redis, redisKey } from '../redis';
import { GuessFeedback } from '../types';

export type SingleGameMode = string;

export interface SingleGameState {
  id: string;
  identityKey: string;
  userId: number | null;
  guestKey: string | null;
  mode: SingleGameMode;
  targetPlayerId: number;
  guesses: GuessFeedback[];
  /** Milliseconds from game creation for each accepted guess. */
  guessTimes: Array<number | null>;
  createdAt: number;
  lastActiveAt: number;
}

// Active single-player games expire after thirty minutes without a write/guess.
// This is also the retention window used by the online single-game counter.
export const SINGLE_GAME_TTL_SECONDS = 1800;
const localGames = new Map<string, SingleGameState>();
const localActiveGames = new Map<string, string>();

function gameKey(id: string): string {
  return redisKey(`single:game:${id}`);
}

function activeKey(identityKey: string, mode: SingleGameMode): string {
  return redisKey(`single:active:${identityKey}:${mode}`);
}

function localActiveKey(identityKey: string, mode: SingleGameMode): string {
  return `${identityKey}:${mode}`;
}

function pruneLocalGame(game: SingleGameState): boolean {
  if (game.lastActiveAt + SINGLE_GAME_TTL_SECONDS * 1000 > Date.now()) return false;
  localGames.delete(game.id);
  const active = localActiveKey(game.identityKey, game.mode);
  if (localActiveGames.get(active) === game.id) localActiveGames.delete(active);
  return true;
}

function normalizeGuessTimes(game: SingleGameState): void {
  if (!Array.isArray(game.guessTimes)) game.guessTimes = [];
  game.guessTimes = game.guessTimes.map((value) => (
    typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? Math.floor(value)
      : null
  ));
  if (game.guessTimes.length > game.guesses.length) {
    game.guessTimes = game.guessTimes.slice(0, game.guesses.length);
  }
  while (game.guessTimes.length < game.guesses.length) game.guessTimes.push(null);
}

export async function createOrResumeSingleGame(input: {
  identityKey: string;
  userId: number | null;
  guestKey: string | null;
  mode: SingleGameMode;
  targetPlayerId: number;
}): Promise<SingleGameState> {
  return (await createOrResumeSingleGameWithStatus(input)).game;
}

export async function createOrResumeSingleGameWithStatus(input: {
  identityKey: string;
  userId: number | null;
  guestKey: string | null;
  mode: SingleGameMode;
  targetPlayerId: number;
}): Promise<{ game: SingleGameState; created: boolean }> {
  const existing = await loadActiveSingleGame(input.identityKey, input.mode);
  if (existing) return { game: existing, created: false };

  const now = Date.now();
  const game: SingleGameState = {
    id: randomUUID(),
    identityKey: input.identityKey,
    userId: input.userId,
    guestKey: input.guestKey,
    mode: input.mode,
    targetPlayerId: input.targetPlayerId,
    guesses: [],
    guessTimes: [],
    createdAt: now,
    lastActiveAt: now,
  };
  await saveSingleGame(game);
  return { game, created: true };
}

export async function loadActiveSingleGame(
  identityKey: string,
  mode: SingleGameMode
): Promise<SingleGameState | null> {
  const client = redis();
  if (!client) {
    const active = localActiveKey(identityKey, mode);
    const existingId = localActiveGames.get(active);
    if (!existingId) return null;
    const existing = await loadSingleGame(existingId, identityKey);
    if (existing) return existing;
    localActiveGames.delete(active);
    return null;
  }
  const active = activeKey(identityKey, mode);
  const existingId = await client.get(active);
  if (!existingId) return null;
  // Restoring after a refresh must not extend the inactivity window.
  const existing = await loadSingleGame(existingId, identityKey);
  if (existing) return existing;
  await client.del(active);
  return null;
}

export async function loadSingleGame(
  id: string,
  identityKey: string,
  touch = false
): Promise<SingleGameState | null> {
  const client = redis();
  if (!client) {
    const game = localGames.get(id);
    if (!game || game.identityKey !== identityKey || pruneLocalGame(game)) return null;
    normalizeGuessTimes(game);
    if (touch) await saveSingleGame(game);
    return game;
  }
  const raw = await client.get(gameKey(id));
  if (!raw) return null;
  const game = JSON.parse(raw) as SingleGameState;
  if (game.identityKey !== identityKey) return null;
  if (!Array.isArray(game.guesses)) game.guesses = [];
  normalizeGuessTimes(game);
  if (game.lastActiveAt + SINGLE_GAME_TTL_SECONDS * 1000 <= Date.now()) {
    await deleteSingleGame(game);
    return null;
  }
  if (touch) {
    game.lastActiveAt = Date.now();
    await saveSingleGame(game);
  }
  return game;
}

export async function saveSingleGame(game: SingleGameState): Promise<void> {
  normalizeGuessTimes(game);
  game.lastActiveAt = Date.now();
  const client = redis();
  if (!client) {
    localGames.set(game.id, game);
    localActiveGames.set(localActiveKey(game.identityKey, game.mode), game.id);
    return;
  }
  const expiresAt = game.lastActiveAt + SINGLE_GAME_TTL_SECONDS * 1000;
  await client.multi()
    .set(gameKey(game.id), JSON.stringify(game), { EX: SINGLE_GAME_TTL_SECONDS })
    .set(activeKey(game.identityKey, game.mode), game.id, { EX: SINGLE_GAME_TTL_SECONDS })
    .zAdd(redisKey('presence:single'), { score: expiresAt, value: game.id })
    .exec();
}

export async function deleteSingleGame(game: SingleGameState): Promise<void> {
  const active = activeKey(game.identityKey, game.mode);
  const client = redis();
  if (!client) {
    localGames.delete(game.id);
    const localActive = localActiveKey(game.identityKey, game.mode);
    if (localActiveGames.get(localActive) === game.id) localActiveGames.delete(localActive);
    return;
  }
  await evalCommandScript(
    'single-game-delete-v1',
    `redis.call('ZREM', KEYS[3], ARGV[1])
     if redis.call('get', KEYS[1]) == ARGV[1] then
       return redis.call('del', KEYS[1], KEYS[2])
     end
     return redis.call('del', KEYS[2])`,
    [active, gameKey(game.id), redisKey('presence:single')],
    [game.id]
  );
}
