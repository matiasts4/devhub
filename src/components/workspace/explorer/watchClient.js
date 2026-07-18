/**
 * Scoped FS watch client: registers expanded dirs with /api/fs/watch (SSE).
 * Lazy — no connection until the first watchAdd.
 */

let eventSource = null;
let basePath = '';
const watched = new Set();
const listeners = new Set();

function ensureConnection() {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
  if (eventSource || !basePath) return;

  const url = `/api/fs/watch?base=${encodeURIComponent(basePath)}`;
  eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      const paths = Array.isArray(payload?.paths) ? payload.paths : [];
      if (paths.length === 0) return;
      for (const listener of listeners) listener(paths);
    } catch {
      // ignore malformed batches
    }
  };

  eventSource.onerror = () => {
    // Browser will retry; keep watched set so a reconnect can re-register.
  };
}

async function postWatch(action, paths) {
  if (!basePath || paths.length === 0) return;
  ensureConnection();
  try {
    await fetch('/api/fs/watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base: basePath, action, paths }),
    });
  } catch {
    // best-effort
  }
}

export function setWatchBase(nextBase) {
  const normalized = String(nextBase || '');
  if (normalized === basePath) return;
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  watched.clear();
  basePath = normalized;
}

export function watchAdd(paths) {
  const next = [];
  for (const p of paths || []) {
    const key = String(p ?? '');
    if (watched.has(key)) continue;
    watched.add(key);
    next.push(key);
  }
  void postWatch('add', next);
}

export function watchRemove(paths) {
  const next = [];
  for (const p of paths || []) {
    const key = String(p ?? '');
    if (!watched.delete(key)) continue;
    next.push(key);
  }
  void postWatch('remove', next);
}

export function listenFsChanged(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearAllWatches() {
  if (watched.size > 0) {
    void postWatch('remove', [...watched]);
    watched.clear();
  }
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}
