/**
 * Shared TTY endpoint cache + in-flight coalesce for warm ∥ connect.
 * Avoids paying GET /api/terminal/session twice (Turbopack cold ~6s).
 */

const DEFAULT_TTL_MS = 60_000;

/** @type {{ port: number, wsPath: string, cwd: string|null, at: number }|null} */
let cached = null;

/** @type {Promise<{ port: number, wsPath: string }>|null} */
let inflight = null;

function normalizeCwd(cwd) {
  if (!cwd) return null;
  return String(cwd);
}

export function rememberTerminalEndpoint(
  { port, wsPath, cwd = null } = {},
  { now = Date.now() } = {}
) {
  const nPort = Number(port);
  if (!Number.isFinite(nPort) || nPort <= 0 || !wsPath) return null;
  cached = {
    port: nPort,
    wsPath: String(wsPath),
    cwd: normalizeCwd(cwd),
    at: now,
  };
  return cached;
}

export function peekTerminalEndpoint({
  cwd = null,
  ttlMs = DEFAULT_TTL_MS,
  now = Date.now(),
} = {}) {
  if (!cached) return null;
  if (now - cached.at > ttlMs) {
    cached = null;
    return null;
  }
  const want = normalizeCwd(cwd);
  // Cached endpoint is process-global (one WSS); cwd is advisory for logging only.
  if (want && cached.cwd && want !== cached.cwd) {
    // Still usable — same TTY server serves all cwds.
  }
  return { port: cached.port, wsPath: cached.wsPath };
}

export function clearTerminalEndpointCache() {
  cached = null;
  inflight = null;
}

/**
 * Coalesce concurrent warm/connect callers onto one GET.
 * @param {() => Promise<{port?: number, wsPath?: string}>} fetcher
 */
export function coalesceTerminalEndpointFetch(fetcher) {
  if (typeof fetcher !== 'function') {
    return Promise.reject(new Error('fetcher required'));
  }
  const hit = peekTerminalEndpoint();
  if (hit) return Promise.resolve(hit);

  if (inflight) return inflight;

  inflight = Promise.resolve()
    .then(() => fetcher())
    .then((data) => {
      if (data?.port && data?.wsPath) {
        rememberTerminalEndpoint(data);
        return { port: Number(data.port), wsPath: String(data.wsPath) };
      }
      throw new Error('terminal endpoint missing port/wsPath');
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function getTerminalEndpointInflight() {
  return inflight;
}
