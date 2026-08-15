import { db } from './knex';
import { ensureSchema } from './schema';
import { syncSeedPlayers } from './seedPlayers';

async function run() {
  await ensureSchema();
  const result = await syncSeedPlayers();
  console.log(`[seed] Liquipedia 选手同步完成：新增 ${result.created}，更新 ${result.updated}，停用 ${result.disabled}。`);
  await db.destroy();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
