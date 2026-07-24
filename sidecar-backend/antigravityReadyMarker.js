/**
 * Antigravity (agy) TUI readiness detector + swarm ready-marker writer
 * (CJS sidecar mirror).
 *
 * Keep detectAntigravityTuiReady in sync with
 * src/lib/terminal/antigravityReadyMarker.js.
 * writeAntigravityReadyMarker mirrors writeOpencodeReadyMarker
 * (sidecar-backend/opencodeReadyMarker.js) but uses the generic
 * /tmp/devhub-agent-ready-<program>-<tmux> path that
 * buildOpencodeReadyWaitBlock (agentLaunchWrapper.js) polls.
 */

const fs = require('fs');

function normalizeAntigravityLaunchCommand(initialCommand) {
  if (!initialCommand || typeof initialCommand !== 'string') return '';
  return initialCommand.replace(/\s*#recovery-\d+\s*$/, '').trim();
}

function isAntigravityLaunchCommand(initialCommand) {
  return /\b(?:agy|antigravity)\b/i.test(normalizeAntigravityLaunchCommand(initialCommand));
}

function detectAntigravityTuiReady(text) {
  if (!text || typeof text !== 'string') return false;
  // OSC window title set by the Antigravity TUI
  if (/\]0;antigravity\b/i.test(text)) return true;
  // Idle footer hint line
  if (/\?\s+for shortcuts/i.test(text)) return true;
  // Footer status row: "<permission-mode> · <model>", e.g. "accept-edits · Gemini 3.5 Flash"
  if (/accept-edits\s*·/i.test(text)) return true;
  // Bare agent prompt line ("antigravity>" / "antigravity" / "antigravity (v1.2.3)")
  if (/^\s*antigravity(?:\s*\(v[^)]*\))?\s*>?\s*$/im.test(text)) return true;
  if (/^\s*antigravity>/im.test(text)) return true;
  // Working footer (esc/ctrl+c to cancel|interrupt)
  if (/esc\s+to\s+(?:cancel|interrupt)/i.test(text)) return true;
  if (/ctrl\+c\s+to\s+(?:cancel|interrupt)/i.test(text)) return true;
  // Permission prompt — proves the TUI is live even though it is not "ready
  // for input" (needed so pre-attached panels blocked on a prompt still enter
  // agent detection).
  if (/requesting permission for:/i.test(text)) return true;
  if (/do you want to proceed\?/i.test(text)) return true;
  return false;
}

function resolveAntigravityReadyMarkerPath(tmuxSession) {
  const normalized = String(tmuxSession || '').trim();
  if (!normalized) return null;
  const safe = normalized.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe) return null;
  return `/tmp/devhub-agent-ready-agy-${safe}`;
}

function writeAntigravityReadyMarker(tmuxSession, payload = {}) {
  const markerPath = resolveAntigravityReadyMarkerPath(tmuxSession);
  if (!markerPath) return null;
  const body = JSON.stringify({
    tmuxSession,
    program: 'agy',
    ...payload,
    at: Date.now(),
  });
  fs.writeFileSync(markerPath, body, { encoding: 'utf8', mode: 0o644 });
  return markerPath;
}

module.exports = {
  detectAntigravityTuiReady,
  isAntigravityLaunchCommand,
  normalizeAntigravityLaunchCommand,
  resolveAntigravityReadyMarkerPath,
  writeAntigravityReadyMarker,
};
