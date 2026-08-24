const base = (process.env.SMOKE_URL || '').replace(/\/$/, '');
if (!base) throw new Error('SMOKE_URL_REQUIRED');
const checks = ['/api/health', '/api/players/list'];
for (const endpoint of checks) {
  const response = await fetch(base + endpoint);
  if (!response.ok && response.status !== 304) throw new Error(`SMOKE_FAILED:${endpoint}:${response.status}`);
  console.log(`ok ${endpoint} ${response.status}`);
}
const page = await fetch(base + '/');
if (!page.ok || !(await page.text()).includes('<html')) throw new Error('SMOKE_FAILED:/');
console.log('ok /');
