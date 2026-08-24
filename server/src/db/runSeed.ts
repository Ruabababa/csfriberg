import { db } from './knex';
import { ensureSchema } from './schema';
import { fixedSeedSummary, syncSeedPlayers } from './seedPlayers';

async function run() {
  await ensureSchema();
  console.log('[seed] 固定首发数据摘要：' + JSON.stringify(fixedSeedSummary()));
  const result = await syncSeedPlayers();
  console.log(`[seed] 固定 81 人选手数据导入完成：新增 ${result.created}，更新 ${result.updated}，停用 ${result.disabled}。`);
  await db.destroy();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
