import { evalCommandScript, redis, redisKey } from '../redis';

const WINDOW_SECONDS = 60;
const PERSIST_LIMIT = 4;
const localWindows = new Map<string, { expiresAt: number; count: number; games: Map<string, boolean> }>();

/** Returns whether this completed single-player game should be persisted. */
export async function shouldPersistSingleSettlement(
  identityKey: string,
  gameId: string
): Promise<boolean> {
  if (!redis()) {
    const now = Date.now();
    let window = localWindows.get(identityKey);
    if (!window || window.expiresAt <= now) {
      window = { expiresAt: now + WINDOW_SECONDS * 1000, count: 0, games: new Map() };
      localWindows.set(identityKey, window);
    }
    const existing = window.games.get(gameId);
    if (existing !== undefined) return existing;
    window.count += 1;
    const allowed = window.count <= PERSIST_LIMIT;
    window.games.set(gameId, allowed);
    return allowed;
  }
  const result = await evalCommandScript(
    'single-settlement-soft-limit-v1',
    `local field = 'game:' .. ARGV[1]
     local existing = redis.call('HGET', KEYS[1], field)
     if existing then return tonumber(existing) end
     local count = tonumber(redis.call('HGET', KEYS[1], 'count') or 0) + 1
     local allowed = count <= tonumber(ARGV[2]) and 1 or 0
     redis.call('HSET', KEYS[1], 'count', tostring(count), field, tostring(allowed))
     if count == 1 or redis.call('TTL', KEYS[1]) < 0 then
       redis.call('EXPIRE', KEYS[1], ARGV[3])
     end
     return allowed`,
    [redisKey(`single:settlement-limit:${identityKey}`)],
    [gameId, String(PERSIST_LIMIT), String(WINDOW_SECONDS)]
  );
  return Number(result) === 1;
}
