import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config';
import { errorHandler } from './middleware/common';
import { requireAdmin, requireAuth } from './middleware/auth';
import { rejectMissingClientAsset, setClientAssetCacheHeaders } from './middleware/clientAssets';
import { parseJsonOnce, rejectOversizedBody } from './middleware/jsonBody';
import { requirePow } from './middleware/pow';
import { rateLimit } from './middleware/rateLimit';
import adminRoutes from './routes/admin';
import announcementRoutes from './routes/announcements';
import authRoutes from './routes/auth';
import externalPlayerRoutes, { externalPlayerAuth } from './routes/externalPlayers';
import gameRoutes from './routes/game';
import leaderboardRoutes from './routes/leaderboard';
import playerRoutes from './routes/players';
import powRoutes from './routes/pow';
import statsRoutes from './routes/stats';
import { isRedisAvailable } from './redis';
import { getRuntimeSnapshot } from './services/runtimeMonitor';
import { injectUmamiScript } from './services/umami';

const CLOUDFLARE_INSIGHTS_SCRIPT_ORIGIN = 'https://static.cloudflareinsights.com';
const CLOUDFLARE_INSIGHTS_BEACON_ORIGIN = 'https://cloudflareinsights.com';

export interface AppRuntimeState {
  shuttingDown: boolean;
}

interface CreateAppOptions {
  serveStatic?: boolean;
  runtimeState?: AppRuntimeState;
}

function clientAssets(serveStatic: boolean): {
  clientDist: string;
  indexHtml: string | null;
  inlineScriptHashes: string[];
} {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  const clientIndexPath = path.join(clientDist, 'index.html');
  const rawIndexHtml = serveStatic && fs.existsSync(clientIndexPath)
    ? fs.readFileSync(clientIndexPath, 'utf8')
    : null;
  const inlineScriptHashes = rawIndexHtml
    ? [...rawIndexHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
      (match) => `'sha256-${crypto.createHash('sha256').update(match[1], 'utf8').digest('base64')}'`
    )
    : [];
  return { clientDist, indexHtml: rawIndexHtml, inlineScriptHashes };
}

export function createApp(options: CreateAppOptions = {}): express.Express {
  const runtimeState = options.runtimeState ?? { shuttingDown: false };
  const { clientDist, indexHtml: rawIndexHtml, inlineScriptHashes } = clientAssets(
    options.serveStatic !== false
  );
  const app = express();
  app.set('trust proxy', config.trustProxy ? 1 : false);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'wasm-unsafe-eval'",
          CLOUDFLARE_INSIGHTS_SCRIPT_ORIGIN,
          ...(config.umami ? [config.umami.origin] : []),
          ...inlineScriptHashes,
        ],
        workerSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: [
          "'self'",
          ...config.corsOrigins,
          CLOUDFLARE_INSIGHTS_BEACON_ORIGIN,
          ...(config.umami ? [config.umami.origin] : []),
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }));
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use((req, res, next) => {
    if (runtimeState.shuttingDown) {
      return res.status(503).json({ code: 'SERVER_SHUTTING_DOWN' });
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin && !config.corsOrigins.includes(origin)) {
        return res.status(403).json({ code: 'INVALID_ORIGIN' });
      }
    }
    next();
  });
  app.get('/api/health', (_req, res) => res.json({
    ok: true,
    redis: isRedisAvailable() ? 'up' : 'degraded',
    features: {
      leaderboard: config.showLeaderboard,
      multiplayer: config.multiplayerEnabled,
    },
    runtime: getRuntimeSnapshot(),
  }));
  app.use('/api', rateLimit({ name: 'api', limit: 600, windowSeconds: 60 }));
  app.use('/api/pow', rejectOversizedBody(16 * 1024), parseJsonOnce('16kb'));
  app.use('/api/pow', powRoutes);
  app.use('/api/external', externalPlayerAuth);
  app.use(
    '/api/external',
    rejectOversizedBody(config.adminImportBodyLimitBytes),
    parseJsonOnce(`${config.adminImportBodyLimitBytes}b`)
  );
  app.use('/api/external', externalPlayerRoutes);
  app.use('/api', requirePow);
  app.use('/api/admin/players/import', requireAuth, requireAdmin);
  app.use(
    '/api/admin/players/import',
    rejectOversizedBody(config.adminImportBodyLimitBytes),
    parseJsonOnce(`${config.adminImportBodyLimitBytes}b`)
  );
  app.use('/api', rejectOversizedBody(64 * 1024), parseJsonOnce('64kb'));

  app.use('/api/auth', authRoutes);
  app.use('/api/players', playerRoutes);
  app.use('/api/game', gameRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/leaderboard', leaderboardRoutes);
  app.use('/api/announcements', announcementRoutes);
  app.use('/api/admin', adminRoutes);

  if (rawIndexHtml !== null) {
    const indexHtml = injectUmamiScript(rawIndexHtml, config.umami);
    app.use(express.static(clientDist, { index: false, setHeaders: setClientAssetCacheHeaders }));
    app.use(rejectMissingClientAsset);
    app.get(/^(?!\/api|\/socket\.io).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.type('html').send(indexHtml);
    });
  }

  app.use(errorHandler);
  return app;
}
