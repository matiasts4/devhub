import path from 'path';
import chokidar from 'chokidar';
import { HEAVY_DIR_NAMES } from './pathSandbox';

const GLOBAL_KEY = '__DEVHUB_FS_WATCH_REGISTRY__';

function getRegistry() {
  if (!globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY] = {
      byBase: new Map(),
    };
  }
  return globalThis[GLOBAL_KEY];
}

function normalizeRel(base, absPath) {
  const rel = path.relative(base, absPath).split(path.sep).join('/');
  if (!rel || rel.startsWith('..')) return null;
  return rel;
}

function shouldIgnoreAbs(absPath) {
  const parts = absPath.split(path.sep);
  return parts.some((p) => HEAVY_DIR_NAMES.has(p));
}

function ensureBase(baseAbs) {
  const registry = getRegistry();
  let entry = registry.byBase.get(baseAbs);
  if (entry) return entry;

  const refcounts = new Map();
  const clients = new Set();
  let pending = new Set();
  let flushTimer = null;
  let windowStart = null;
  let watcher = null;

  const flush = () => {
    flushTimer = null;
    windowStart = null;
    if (pending.size === 0) return;
    const paths = [...pending];
    pending = new Set();
    const payload = `data: ${JSON.stringify({ paths })}\n\n`;
    for (const client of clients) {
      try {
        client.enqueue(payload);
      } catch {
        clients.delete(client);
      }
    }
  };

  const schedule = (relPaths) => {
    for (const p of relPaths) pending.add(p);
    const now = Date.now();
    if (windowStart == null) windowStart = now;
    if (now - windowStart >= 1000) {
      if (flushTimer) clearTimeout(flushTimer);
      flush();
      return;
    }
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 150);
  };

  const ensureWatcher = () => {
    if (watcher) return;
    watcher = chokidar.watch([], {
      ignoreInitial: true,
      persistent: true,
      depth: 0,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      ignored: (p) => shouldIgnoreAbs(p),
    });
    watcher.on('all', (_event, absPath) => {
      if (!absPath || shouldIgnoreAbs(absPath)) return;
      const rel = normalizeRel(baseAbs, absPath);
      if (rel == null) return;
      const parent = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
      schedule([rel, parent]);
    });
  };

  entry = {
    baseAbs,
    refcounts,
    clients,
    addClient(controller) {
      clients.add(controller);
    },
    removeClient(controller) {
      clients.delete(controller);
    },
    addPaths(rels) {
      ensureWatcher();
      for (const rel of rels) {
        const key = rel || '';
        const abs = key ? path.join(baseAbs, ...key.split('/')) : baseAbs;
        const count = refcounts.get(key) || 0;
        if (count === 0) {
          try {
            watcher.add(abs);
          } catch {
            // ignore missing dirs
          }
        }
        refcounts.set(key, count + 1);
      }
    },
    removePaths(rels) {
      if (!watcher) return;
      for (const rel of rels) {
        const key = rel || '';
        const count = refcounts.get(key) || 0;
        if (count <= 1) {
          refcounts.delete(key);
          const abs = key ? path.join(baseAbs, ...key.split('/')) : baseAbs;
          try {
            watcher.unwatch(abs);
          } catch {
            // ignore
          }
        } else {
          refcounts.set(key, count - 1);
        }
      }
    },
  };

  registry.byBase.set(baseAbs, entry);
  return entry;
}

export function getWatchEntry(baseAbs) {
  return ensureBase(path.resolve(baseAbs));
}
