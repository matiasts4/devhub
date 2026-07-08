/**
 * Client-side cache for /api/terminal/session → { port, wsPath }.
 *
 * IMPORTANT: only cache endpoints that have been *confirmed* by a successful
 * WebSocket open (or a fresh API response we are about to use). Optimistic
 * reuse of a dead port causes 10s WebSocket hangs (browser never fires
 * onerror promptly on refused localhost WS).
 */

const PREFETCH_TTL_MS = 60_000; // 1 minute for API-resolved ports
const CONFIRMED_TTL_MS = 300_000; // 5 minutes for ports that opened a live WS

let inflight = null;
/** @type {{ data: { port: number, wsPath: string }, at: number, query: string, confirmed: boolean } | null} */
let cache = null;

function buildSessionQuery(cwd) {
  const trimmed = String(cwd || '').trim();
  return trimmed ? `?cwd=${encodeURIComponent(trimmed)}` : '';
}

function isCacheFresh(entry, ttlMs) {
  return Boolean(entry?.data?.port) && Date.now() - entry.at < ttlMs;
}

/**
 * Last confirmed endpoint (WS actually opened). Safe for optimistic reconnect.
 * Unconfirmed API-only cache is NOT returned here.
 */
export function getLastKnownTerminalEndpoint() {
  if (!cache?.confirmed) return null;
  if (!isCacheFresh(cache, CONFIRMED_TTL_MS)) return null;
  return cache.data;
}

export function markTerminalEndpointConfirmed(port, wsPath) {
  if (!port) return;
  cache = {
    data: { port: Number(port), wsPath: wsPath || cache?.data?.wsPath || '/terminal' },
    at: Date.now(),
    query: cache?.query || '',
    confirmed: true,
  };
}

export function invalidateTerminalEndpointCache(reason) {
  if (cache) {
    console.info('[session-endpoint] cache invalidated', reason || '', cache.data);
  }
  cache = null;
  inflight = null;
}

export function prefetchTerminalSessionEndpoint(cwd) {
  const query = buildSessionQuery(cwd);
  if (isCacheFresh(cache, PREFETCH_TTL_MS) && (cache.query === query || cache.confirmed)) {
    return Promise.resolve(cache.data);
  }
  if (inflight) {
    return inflight.promise;
  }

  const promise = fetch(`/api/terminal/session${query}`, { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) return null;
      return res.json();
    })
    .then((data) => {
      if (data?.port) {
        // API-resolved but not yet WS-confirmed.
        cache = {
          data: { port: Number(data.port), wsPath: data.wsPath || '/terminal' },
          at: Date.now(),
          query,
          confirmed: false,
        };
        return cache.data;
      }
      return data;
    })
    .catch(() => null)
    .finally(() => {
      if (inflight?.query === query) {
        inflight = null;
      }
    });

  inflight = { query, promise };
  return promise;
}

/**
 * Resolve endpoint for connect. Always prefers a fresh API response unless we
 * have a *confirmed* live port (previous successful WS). Never returns a stale
 * unconfirmed port across process restarts / HMR.
 */
export async function resolveTerminalSessionEndpoint(cwd, { force = false } = {}) {
  if (force) {
    invalidateTerminalEndpointCache('force-refresh');
  }

  // Confirmed live port: reuse without network (reconnect / multi-panel).
  if (!force && getLastKnownTerminalEndpoint()) {
    return getLastKnownTerminalEndpoint();
  }

  // Fresh unconfirmed API cache (same page load, just resolved).
  if (!force && isCacheFresh(cache, PREFETCH_TTL_MS) && cache.data?.port) {
    return cache.data;
  }

  if (inflight) {
    return inflight.promise;
  }
  return prefetchTerminalSessionEndpoint(cwd);
}

/** Test helper */
export function __resetSessionEndpointPrefetchForTests() {
  inflight = null;
  cache = null;
}
