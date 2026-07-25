/**
 * Qoder CLI TUI readiness detector (ESM source of truth).
 *
 * CJS sidecar mirror: sidecar-backend/qodercliReadyMarker.js — keep in sync.
 */

export function detectQodercliTuiReady(text) {
  if (!text || typeof text !== 'string') return false;
  if (/\?\s+for shortcuts/i.test(text)) return true;
  if (/^\s*(?:qodercli|qoder)\s*>/im.test(text)) return true;
  if (/esc\s+to\s+(?:cancel|interrupt)/i.test(text)) return true;
  if (/ctrl\+c\s+to\s+(?:cancel|interrupt)/i.test(text)) return true;
  if (/do you want to proceed\?/i.test(text)) return true;
  if (/\]\s*0;\s*qoder/i.test(text)) return true;
  return false;
}
