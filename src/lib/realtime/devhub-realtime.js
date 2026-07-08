import path from 'path';
import chokidar from 'chokidar';
import { WebSocketServer } from 'ws';

const GLOBAL_KEY = '__DEVHUB_REALTIME_STATE__';
const DEFAULT_IGNORED_SEGMENTS = [
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  'src-tauri/target',
];

function getState() {
  if (!globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY] = {
      server: null,
      watcher: null,
      clients: new Set(),
      started: false,
      rootPath: process.cwd(),
      wsUrl: null,
    };
  }

  return globalThis[GLOBAL_KEY];
}

function safeRelativePath(rootPath, absolutePath) {
  const rel = path.relative(rootPath, absolutePath);
  return rel || '.';
}

function shouldIgnorePath(watchPath) {
  const normalized = watchPath.split(path.sep).join('/');
  return DEFAULT_IGNORED_SEGMENTS.some((segment) => {
    const normalizedSegment = segment.split(path.sep).join('/');
    return (
      normalized.includes(`/${normalizedSegment}/`) || normalized.endsWith(`/${normalizedSegment}`)
    );
  });
}

function broadcast(payload) {
  const state = getState();
  const data = JSON.stringify(payload);

  for (const client of state.clients) {
    if (client.readyState === client.OPEN) {
      client.send(data);
    }
  }
}

export function ensureRealtimeServer(options = {}) {
  const state = getState();
  const rootPath = options.rootPath || process.cwd();

  if (state.started) {
    return {
      started: true,
      wsUrl: state.wsUrl,
      rootPath: state.rootPath,
      clients: state.clients.size,
    };
  }

  const wsPort = Number(process.env.DEVHUB_WS_PORT || 3401);
  const wsHost = process.env.DEVHUB_WS_HOST || '127.0.0.1';

  const server = new WebSocketServer({
    host: wsHost,
    port: wsPort,
  });

  state.server = server;
  state.rootPath = rootPath;
  state.wsUrl = `ws://${wsHost}:${wsPort}`;

  server.on('connection', (socket) => {
    state.clients.add(socket);
    socket.send(
      JSON.stringify({
        type: 'ws:connected',
        rootPath: state.rootPath,
        message: 'DevHub realtime channel ready',
        timestamp: Date.now(),
      })
    );

    socket.on('message', (raw) => {
      const text = String(raw);
      console.log(`[Reactivity-WS] WS message received: ${text}`);
      broadcast({
        type: 'ws:echo',
        message: text,
        timestamp: Date.now(),
      });
    });

    socket.on('close', () => {
      state.clients.delete(socket);
    });
  });

  const watcher = chokidar.watch(rootPath, {
    ignored: (watchPath) => shouldIgnorePath(watchPath),
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 150,
      pollInterval: 25,
    },
  });

  watcher.on('all', (eventName, changedPath) => {
    const relativePath = safeRelativePath(state.rootPath, changedPath);
    const payload = {
      type: 'fs:change',
      event: eventName,
      path: relativePath,
      absolutePath: changedPath,
      timestamp: Date.now(),
    };

    console.log(`[Reactivity-WS] chokidar:${eventName} -> ${relativePath}`);
    broadcast(payload);
  });

  watcher.on('error', (error) => {
    console.error('[Reactivity-WS] chokidar error:', error);
    broadcast({
      type: 'fs:error',
      message: error.message,
      timestamp: Date.now(),
    });
  });

  state.watcher = watcher;
  state.started = true;

  console.log(`[Reactivity-WS] WS server listening at ${state.wsUrl}`);
  console.log(`[Reactivity-WS] Watching filesystem root: ${state.rootPath}`);

  return {
    started: true,
    wsUrl: state.wsUrl,
    rootPath: state.rootPath,
    clients: 0,
  };
}

export function getRealtimeStatus() {
  const state = getState();
  return {
    started: state.started,
    wsUrl: state.wsUrl,
    rootPath: state.rootPath,
    clients: state.clients.size,
  };
}
