import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const url = process.env.DB_URL?.trim();
if (!url || !/^postgres(?:ql):\/\//i.test(url)) throw new Error('DB_URL_POSTGRES_REQUIRED');
const dir = path.resolve(process.env.BACKUP_DIR || 'backups');
await mkdir(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(dir, `siegeguess-${stamp}.dump`);
await new Promise((resolve, reject) => {
  const child = spawn('pg_dump', ['--format=custom', '--no-owner', '--file', output, url], { stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`PG_DUMP_FAILED:${code}`)));
});
console.log(output);
