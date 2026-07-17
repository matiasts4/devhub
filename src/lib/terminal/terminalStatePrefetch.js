/**
 * Read-only idle prefetch of terminal workspace state + restore manifest.
 * Consumed once on TWM mount when still fresh for the same projectId.
 */

const DEFAULT_TTL_MS = 60_000;

/** @type {Map<string, { snapshot: object, at: number }>} */
const cache = new Map();

function storageKey(projectId) {
  return projectId ? `devhub_terminal_state:${projectId}` : 'devhub_terminal_state';
}

function manifestKey(projectId) {
  return projectId ? `devhub_restore_manifest:${projectId}` : 'devhub_restore_manifest';
}

function safeParse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {string} projectId
 * @param {Storage|null} storage
 * @param {{ ttlMs?: number, now?: number }} [opts]
 */
export function prefetchTerminalState(projectId, storage, opts = {}) {
  if (!projectId || !storage) return null;
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const now = opts.now ?? Date.now();

  let terminalState = null;
  let restoreManifest = null;
  try {
    terminalState = safeParse(storage.getItem(storageKey(projectId)));
    if (!terminalState) {
      terminalState = safeParse(storage.getItem('devhub_terminal_state'));
    }
    restoreManifest = safeParse(storage.getItem(manifestKey(projectId)));
  } catch {
    return null;
  }

  if (!terminalState && !restoreManifest) return null;

  const snapshot = {
    projectId,
    terminalState,
    restoreManifest,
    expiresAt: now + ttlMs,
  };
  cache.set(projectId, { snapshot, at: now });
  return snapshot;
}

/**
 * Consume-once. Returns null if missing, wrong project, or expired.
 * @param {string} projectId
 * @param {{ now?: number }} [opts]
 */
export function takePrefetchedTerminalState(projectId, opts = {}) {
  if (!projectId) return null;
  const entry = cache.get(projectId);
  if (!entry) return null;
  cache.delete(projectId);
  const now = opts.now ?? Date.now();
  if (entry.snapshot.projectId !== projectId) return null;
  if (entry.snapshot.expiresAt && now > entry.snapshot.expiresAt) return null;
  return entry.snapshot;
}

export function peekPrefetchedTerminalState(projectId) {
  return cache.get(projectId)?.snapshot ?? null;
}

export function clearTerminalStatePrefetch(projectId) {
  if (projectId) cache.delete(projectId);
  else cache.clear();
}
