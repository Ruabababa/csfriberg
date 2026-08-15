import http from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createApp, type AppRuntimeState } from './app';
import { config, validateProductionConfig } from './config';
import { assertDatabaseReady } from './db/ready';
import { db } from './db/knex';
import {
  closeRedis,
  duplicateRedisClient,
  initRedis,
  isRedisTimeoutError,
} from './redis';
import { setupSocket } from './socket';
import { initMatchResultWorker } from './services/matchResultQueue';
import { closePasswordWorkers } from './services/password';
import { initPlayerCache } from './services/playerCache';
import { startRuntimeMonitor } from './services/runtimeMonitor';

const SHUTDOWN_TIMEOUT_MS = 10_000;

process.on('unhandledRejection', (reason) => {
  if (isRedisTimeoutError(reason)) {
    console.error('[server:redis-timeout-unhandled]', reason);
    return;
  }
  console.error('[server:unhandled-rejection]', reason);
  setImmediate(() => {
    throw reason instanceof Error ? reason : new Error(String(reason));
  });
});

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        onTimeout();
        reject(new Error('SHUTDOWN_TIMEOUT'));
      } catch (err) {
        reject(err);
      }
    }, timeoutMs);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function main(): Promise<void> {
  validateProductionConfig();
  const stopRuntimeMonitor = startRuntimeMonitor();
  await assertDatabaseReady();
  const redisReady = await initRedis({ multiplayer: config.multiplayerEnabled });
  await initPlayerCache();
  const stopMatchWorker = config.multiplayerEnabled && redisReady
    ? await initMatchResultWorker()
    : async () => undefined;

  const runtimeState: AppRuntimeState = { shuttingDown: false };
  const app = createApp({ runtimeState });
  const server = http.createServer(app);
  let io: Server | null = null;
  let stopSocket: () => Promise<void> = async () => undefined;
  let adapterPubClient: ReturnType<typeof duplicateRedisClient> = null;
  let adapterSubClient: ReturnType<typeof duplicateRedisClient> = null;

  if (config.multiplayerEnabled) {
    io = new Server(server, { cors: { origin: config.corsOrigins, credentials: true } });
    app.set('io', io);
    io.use((_socket, next) => runtimeState.shuttingDown
      ? next(new Error('SERVER_SHUTTING_DOWN'))
      : next());
    if (redisReady) {
      adapterPubClient = duplicateRedisClient('socket-adapter-pub');
      adapterSubClient = duplicateRedisClient('socket-adapter-sub');
      if (adapterPubClient && adapterSubClient) {
        await Promise.all([adapterPubClient.connect(), adapterSubClient.connect()]);
        io.adapter(createAdapter(adapterPubClient, adapterSubClient));
      }
    }
    stopSocket = setupSocket(io);
  }

  server.listen(config.port, () => {
    console.log(`[server] listening on http://localhost:${config.port}`);
    console.log(`[server] multiplayer ${config.multiplayerEnabled ? 'enabled' : 'disabled'}`);
  });

  let shutdownPromise: Promise<void> | null = null;
  const shutdown = async (signal: string): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      runtimeState.shuttingDown = true;
      console.log(`[server] received ${signal}, shutting down`);
      stopRuntimeMonitor();
      const serverClosed = new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeIdleConnections?.();
      });
      const socketClosed = io
        ? new Promise<void>((resolve) => io?.close(() => resolve()))
        : Promise.resolve();
      await Promise.allSettled([
        withTimeout(serverClosed, SHUTDOWN_TIMEOUT_MS, () => server.closeAllConnections?.()),
        withTimeout(socketClosed, SHUTDOWN_TIMEOUT_MS, () => io?.disconnectSockets(true)),
        withTimeout(stopMatchWorker(), SHUTDOWN_TIMEOUT_MS, () => undefined),
      ]);
      await withTimeout(stopSocket(), SHUTDOWN_TIMEOUT_MS, () => undefined).catch((err) => {
        console.error('[shutdown:socket-drain]', err);
      });
      await Promise.allSettled([
        withTimeout(
          adapterPubClient?.isOpen ? adapterPubClient.quit().then(() => undefined) : Promise.resolve(),
          SHUTDOWN_TIMEOUT_MS,
          () => undefined
        ),
        withTimeout(
          adapterSubClient?.isOpen ? adapterSubClient.quit().then(() => undefined) : Promise.resolve(),
          SHUTDOWN_TIMEOUT_MS,
          () => undefined
        ),
        withTimeout(closeRedis(), SHUTDOWN_TIMEOUT_MS, () => undefined),
        withTimeout(closePasswordWorkers(), SHUTDOWN_TIMEOUT_MS, () => undefined),
        withTimeout(db.destroy(), SHUTDOWN_TIMEOUT_MS, () => undefined),
      ]);
    })();
    return shutdownPromise;
  };

  const handleSignal = (signal: string) => {
    const forceExitTimer = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS * 2 + 2_000);
    void shutdown(signal)
      .then(() => {
        clearTimeout(forceExitTimer);
        process.exit(0);
      })
      .catch((err) => {
        clearTimeout(forceExitTimer);
        console.error('[server] shutdown failed', err);
        process.exit(1);
      });
  };
  process.once('SIGINT', () => handleSignal('SIGINT'));
  process.once('SIGTERM', () => handleSignal('SIGTERM'));
}

main().catch((err) => {
  console.error('[server] startup failed', err);
  process.exit(1);
});
