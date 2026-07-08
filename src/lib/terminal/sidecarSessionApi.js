/**
 * Shared sidecar session HTTP helpers (capture + input symmetry).
 *
 * Uses `readSidecarPortForTerminalSession` (not the generic
 * `readProductionSidecarPort`) so these calls resolve the sidecar the same
 * way session creation does: dev runtime never falls back to an installed
 * production sidecar, and transient startup delays get a few retries. Zed's
 * `execute_in_terminal`/`review_terminal_output` tools depend on this HTTP
 * path succeeding so they don't need the fragile client-side
 * `devhub:zed-terminal-input` WebSocket fallback for panels whose PTY only
 * exists in the sidecar (e.g. hidden/unsubscribed terminal-engine-v2 panels).
 */

import { readSidecarPortForTerminalSession } from '@/lib/devhub/sidecarRuntime';

/**
 * @param {string} sessionId
 * @returns {Promise<{ output: string, session_id: string, source: 'sidecar' }|null>}
 */
export async function trySidecarCapture(sessionId) {
  try {
    const port = await readSidecarPortForTerminalSession();
    if (!port) return null;

    const res = await fetch(
      `http://127.0.0.1:${port}/sessions/${encodeURIComponent(sessionId)}/output`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;

    const data = await res.json();
    if (data && typeof data.output === 'string') {
      return { output: data.output, session_id: sessionId, source: 'sidecar' };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {string} sessionId
 * @param {string} data
 * @returns {Promise<{ session_id: string, sent: true, source: 'sidecar' }|null>}
 */
export async function trySidecarInput(sessionId, data) {
  try {
    const port = await readSidecarPortForTerminalSession();
    if (!port) return null;

    const res = await fetch(
      `http://127.0.0.1:${port}/sessions/${encodeURIComponent(sessionId)}/input`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
        cache: 'no-store',
      }
    );
    if (!res.ok) return null;

    const body = await res.json().catch(() => ({}));
    if (body && body.sent === true) {
      return { session_id: sessionId, sent: true, source: 'sidecar' };
    }
    return null;
  } catch {
    return null;
  }
}
