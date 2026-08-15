const { createApp } = require('../server/dist/app');
const { validateProductionConfig } = require('../server/dist/config');
const { assertDatabaseReady } = require('../server/dist/db/ready');
const { initRedis } = require('../server/dist/redis');
const { initPlayerCache } = require('../server/dist/services/playerCache');

const app = createApp({ serveStatic: false });
let readyPromise = null;

async function initializeHttpRuntime() {
  validateProductionConfig();
  await assertDatabaseReady();
  await initRedis({ multiplayer: false });
  await initPlayerCache();
}

function restoreRewrittenApiPath(req) {
  const url = new URL(req.url || '/', 'http://localhost');
  const rewrittenPath = url.searchParams.get('__vercel_api_path');
  if (!rewrittenPath) return;

  url.searchParams.delete('__vercel_api_path');
  url.searchParams.delete('path');
  const query = url.searchParams.toString();
  req.url = `/api/${rewrittenPath}${query ? `?${query}` : ''}`;
}

module.exports = async function handler(req, res) {
  readyPromise ??= initializeHttpRuntime().catch((err) => {
    readyPromise = null;
    throw err;
  });

  try {
    await readyPromise;
    restoreRewrittenApiPath(req);
    app(req, res);
  } catch (err) {
    console.error('[vercel] runtime initialization failed', err);
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ code: 'SERVICE_UNAVAILABLE' }));
    }
  }
};
