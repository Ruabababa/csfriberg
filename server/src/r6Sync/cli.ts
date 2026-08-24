import fs from 'fs/promises';
import path from 'path';
import { normalizeR6Snapshot } from './normalize';

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function resolveSnapshotPath(value: string): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), value),
    path.resolve(__dirname, '../../..', value),
  ];
  for (const candidate of [...new Set(candidates)]) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next supported invocation root.
    }
  }
  throw new Error(`R6_SNAPSHOT_NOT_FOUND:${value}`);
}

async function main(): Promise<void> {
  const source = argument('--source') ?? 'snapshot';
  if (source !== 'snapshot') throw new Error(`UNSUPPORTED_R6_SYNC_SOURCE:${source}`);
  const snapshotPath = argument('--snapshot');
  if (!snapshotPath) throw new Error('R6_SNAPSHOT_PATH_REQUIRED');

  const absoluteSnapshotPath = await resolveSnapshotPath(snapshotPath);
  const raw = await fs.readFile(absoluteSnapshotPath, 'utf8');
  const parsed = JSON.parse(raw);
  const result = normalizeR6Snapshot(parsed);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.resolve(__dirname, '../../data/r6-sync', timestamp);
  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outputDir, 'snapshot.json'), `${JSON.stringify(parsed, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, 'normalized.json'), `${JSON.stringify(result.players, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, 'review.json'), `${JSON.stringify(result.review, null, 2)}\n`),
  ]);

  const summaryPath = path.join(outputDir, 'summary.json');
  const dryRunReport = {
    ...result.summary,
    created: null,
    updated: null,
    disabled: null,
    applied: false,
  };
  // Always leave a complete audit report behind, including when apply is refused
  // or the database transaction fails later.
  await fs.writeFile(summaryPath, `${JSON.stringify(dryRunReport, null, 2)}\n`);

  let applied = null;
  if (process.argv.includes('--apply')) {
    if (result.review.length) throw new Error(`R6_SYNC_REVIEW_REQUIRED:${result.review.length}`);
    const [{ db }, { ensureSchema }, { applyR6Players }] = await Promise.all([
      import('../db/knex'),
      import('../db/schema'),
      import('./apply'),
    ]);
    await ensureSchema();
    try {
      applied = await applyR6Players({
        players: result.players,
        fullSync: result.snapshot.fullSync,
      });
    } finally {
      await db.destroy();
    }
  }
  const report = {
    ...result.summary,
    created: applied?.created ?? null,
    updated: applied?.updated ?? null,
    disabled: applied?.disabled ?? null,
    applied: applied !== null,
  };
  if (applied !== null) {
    await fs.writeFile(summaryPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify({ outputDir, ...report }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
