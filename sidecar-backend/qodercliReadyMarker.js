/**
 * Qoder CLI TUI readiness detector + swarm ready-marker writer (CJS sidecar).
 *
 * Keep detectQodercliTuiReady in sync with
 * src/lib/terminal/qodercliReadyMarker.js (ESM source of truth).
 */

const fs = require('fs');

function detectQodercliTuiReady(text) {
  if (!text || typeof text !== 'string') return false;
  if (/\?\s+for shortcuts/i.test(text)) return true;
  if (/^\s*(?:qodercli|qoder)\s*>/im.test(text)) return true;
  if (/esc\s+to\s+(?:cancel|interrupt)/i.test(text)) return true;
  if (/ctrl\+c\s+to\s+(?:cancel|interrupt)/i.test(text)) return true;
  if (/do you want to proceed\?/i.test(text)) return true;
  if (/\]\s*0;\s*qoder/i.test(text)) return true;
  return false;
}

function resolveQodercliReadyMarkerPath(tmuxSession) {
  const normalized = String(tmuxSession || '').trim();
  if (!normalized) return null;
  const safe = normalized.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe) return null;
  return `/tmp/devhub-agent-ready-qodercli-${safe}`;
}

function writeQodercliReadyMarker(tmuxSession, payload = {}) {
  const markerPath = resolveQodercliReadyMarkerPath(tmuxSession);
  if (!markerPath) return null;
  const body = JSON.stringify({
    tmuxSession,
    program: 'qodercli',
    ...payload,
    at: Date.now(),
  });
  fs.writeFileSync(markerPath, body, { encoding: 'utf8', mode: 0o644 });
  return markerPath;
}

module.exports = {
  detectQodercliTuiReady,
  resolveQodercliReadyMarkerPath,
  writeQodercliReadyMarker,
};
