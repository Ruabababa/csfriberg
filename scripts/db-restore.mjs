import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';

const file = process.argv[2];
const url = process.env.DB_URL?.trim();
if (!file) throw new Error('BACKUP_FILE_REQUIRED');
if (!url || !/^postgres(?:ql):\/\//i.test(url)) throw new Error('DB_URL_POSTGRES_REQUIRED');
await stat(file);
if (process.env.CONFIRM_RESTORE !== 'yes') {
  throw new Error('SET_CONFIRM_RESTORE_YES_TO_RESTORE');
}
await new Promise((resolve, reject) => {
  const child = spawn('pg_restore', ['--clean', '--if-exists', '--no-owner', '--dbname', url, file], { stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`PG_RESTORE_FAILED:${code}`)));
});
