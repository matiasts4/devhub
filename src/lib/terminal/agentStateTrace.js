/**
 * agentStateTrace — best-effort JSONL trace of agent state transitions.
 *
 * Why: detection flakes ("notificó terminó pero sigue trabajando") are
 * intermittent; without a record of WHY each transition happened (reason,
 * hook event, silence ages) they are undebuggable after the fact. Every
 * published transition appends one line to data/logs/agent-state/<date>.jsonl.
 *
 * Contract:
 *   - Never throws, never blocks detection (all I/O wrapped in try/catch).
 *   - Enabled by default; kill-switch DEVHUB_AGENT_TRACE=off.
 *   - Dir override: DEVHUB_AGENT_TRACE_DIR.
 *   - Rotation: single previous generation kept (<file>.1) at 5 MB.
 *
 * Imported by sessionAgentDetector.js and agentHooks/handleHookReport.js —
 * both are bundled into sidecar-backend/bundled/agentDetection.cjs by
 * `npm run build:sidecar-detection` (esbuild keeps fs/path external).
 */

import fs from 'fs';
import path from 'path';

const MAX_TRACE_BYTES = 5 * 1024 * 1024;

let cachedDir = null;

function resolveTraceDir() {
  if (cachedDir) return cachedDir;
  cachedDir =
    process.env.DEVHUB_AGENT_TRACE_DIR || path.join(process.cwd(), 'data', 'logs', 'agent-state');
  return cachedDir;
}

export function isAgentStateTraceEnabled() {
  return process.env.DEVHUB_AGENT_TRACE !== 'off';
}

/**
 * Append one transition entry. `entry` should carry: terminalId, agentType,
 * prev, next, reason, and optionally hookEvent, hookAgeMs, lastActivityAgeMs,
 * source ('ingest'|'tick'|'hook'|'hook-bridge'), upgrade (boolean).
 *
 * @param {object} entry
 */
export function traceAgentStateTransition(entry) {
  if (!isAgentStateTraceEnabled()) return;
  try {
    const dir = resolveTraceDir();
    fs.mkdirSync(dir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(dir, `${day}.jsonl`);
    try {
      const stat = fs.statSync(file);
      if (stat.size > MAX_TRACE_BYTES) {
        fs.renameSync(file, `${file}.1`);
      }
    } catch {
      /* file does not exist yet */
    }
    fs.appendFileSync(file, `${JSON.stringify({ at: Date.now(), ...entry })}\n`);
  } catch {
    /* tracing must never break detection */
  }
}

/**
 * Build and emit a trace entry for a published transition, skipping pure
 * refreshes (same state AND same reason as the session already had — the
 * 800ms stable-signal republishes would otherwise flood the log).
 *
 * @param {object} session
 * @param {object} published — state machine publish result (state, reason…)
 * @param {object} [extra] — {source, upgrade, now}
 */
export function tracePublishedTransition(session, published, extra = {}) {
  if (!published) return;
  const now = extra.now ?? Date.now();
  const prevState = extra.prev ?? session?.agentTuiState ?? null;
  const prevReason = session?.agentTuiStateReason ?? null;
  if (
    !extra.upgrade &&
    published.state === prevState &&
    (published.reason ?? null) === prevReason
  ) {
    return;
  }
  const hookAt = Number(session?.hookState?.at) || null;
  const lastActivityAt = Number(session?.lastActivityAt) || null;
  traceAgentStateTransition({
    terminalId: session?.id ?? null,
    agentType: session?.agentType ?? null,
    prev: prevState,
    next: published.state,
    reason: published.reason ?? null,
    hookEvent: session?.hookState?.event ?? null,
    hookAgeMs: hookAt ? now - hookAt : null,
    lastActivityAgeMs: lastActivityAt ? now - lastActivityAt : null,
    source: extra.source ?? null,
    upgrade: Boolean(extra.upgrade),
  });
}
