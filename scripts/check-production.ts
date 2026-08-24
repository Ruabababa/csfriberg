import { validateProductionConfig } from '../server/src/config';
import { assertDatabaseReady } from '../server/src/db/ready';
import { db } from '../server/src/db/knex';
import { initRedis, closeRedis } from '../server/src/redis';
import { initPlayerCache, getEnabledPlayers } from '../server/src/services/playerCache';
import { validateSeedPlayers, FIXED_SEED_PLAYER_COUNT } from '../server/src/db/seedPlayers';

async function main(): Promise<void> {
  if (process.env.NODE_ENV?.trim().toLowerCase() !== 'production') {
    throw new Error('NODE_ENV_MUST_BE_PRODUCTION');
  }
  validateProductionConfig();
  validateSeedPlayers();
  await assertDatabaseReady();
  await initRedis({ multiplayer: false });
  await initPlayerCache();
  const count = getEnabledPlayers().length;
  if (count !== FIXED_SEED_PLAYER_COUNT) {
    throw new Error(`FIXED_PLAYER_POOL_NOT_READY:${count}`);
  }
  console.log(JSON.stringify({ ok: true, players: count, database: 'ready', redis: 'ready' }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeRedis();
    await db.destroy();
  });
