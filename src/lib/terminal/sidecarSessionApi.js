/**
 * Shared sidecar session HTTP helpers (capture + input symmetry).
 */

import { readProductionSidecarPort } from '@/lib/devhub/sidecarRuntime';

/**
 * @param {string} sessionId
 * @returns {Promise<{ output: string, session_id: string, source: 'sidecar' }|null>}
 */
export async function trySidecarCapture(sessionId) {
  try {
    const port = await readProductionSidecarPort();
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
    const port = await readProductionSidecarPort();
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
