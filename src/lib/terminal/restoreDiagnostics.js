/**
 * restoreDiagnostics — durable client-side restore diagnostics.
 *
 * The sessionStorage debug ring buffer (terminalSessionDebug) dies with the
 * app — exactly when restore forensics are needed after a reboot. This module
 * keeps writing to that same buffer AND relays every entry to
 * POST /api/terminal/restore-log, which persists JSONL on disk
 * (data/logs/terminal-restore.jsonl in dev, $DEVHUB_HOME/logs in the
 * installed app).
 *
 * Relay strategy: in-memory queue flushed every ~2s via fetch keepalive,
 * plus a final navigator.sendBeacon on pagehide/beforeunload.
 *
 * Hard rules:
 * - never throws (restore instrumentation must not break restore itself);
 * - no-op when `typeof window === 'undefined'` (SSR / Node contexts);
 * - MUST NOT import terminalSessionDebug (it imports us — circular import).
 *   The shared sessionStorage buffer helpers live here instead, and
 *   terminalSessionDebug consumes them from this module.
 */

export const RESTORE_DEBUG_STORAGE_KEY = 'devhub_terminal_session_debug';
export const RESTORE_DEBUG_MAX_ENTRIES = 200;

const RELAY_URL = '/api/terminal/restore-log';
const FLUSH_INTERVAL_MS = 2000;
const MAX_QUEUE_ENTRIES = 200;
const MAX_COMMAND_LOG_CHARS = 200;

let queue = [];
let flushTimer = null;
let lifecycleListenersAttached = false;

/** Appends one entry to the shared sessionStorage debug buffer. Never throws. */
export function appendRestoreDebugEntry(entry) {
  if (typeof window === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(RESTORE_DEBUG_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const entries = Array.isArray(parsed) ? parsed : [];
    entries.push(entry);
    sessionStorage.setItem(
      RESTORE_DEBUG_STORAGE_KEY,
      JSON.stringify(entries.slice(-RESTORE_DEBUG_MAX_ENTRIES))
    );
  } catch {
    // ignore quota / serialization failures
  }
}

/** Reads the shared sessionStorage debug buffer (oldest → newest). */
export function readRestoreDebugEntries() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(RESTORE_DEBUG_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Truncates long values (commands) before they hit the durable log. */
export function truncateForDiagnostics(value, max = MAX_COMMAND_LOG_CHARS) {
  const text = String(value || '');
  return text.length > max ? text.slice(0, max) : text;
}

function postBatch(batch) {
  if (batch.length === 0 || typeof fetch !== 'function') return;
  try {
    fetch(RELAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // never throws
  }
}

/** Drains the relay queue via fetch keepalive. Exported for tests/manual flush. */
export function flushRestoreDiagnosticQueue() {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  postBatch(batch);
}

function flushViaBeacon() {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  let sent = false;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const payload = JSON.stringify(batch);
      // Blob sets the JSON content-type; fall back to a plain string where
      // Blob is unavailable (older engines, some test sandboxes).
      const body =
        typeof Blob === 'function' ? new Blob([payload], { type: 'application/json' }) : payload;
      sent = navigator.sendBeacon(RELAY_URL, body);
    }
  } catch {
    sent = false;
  }
  if (!sent) {
    postBatch(batch);
  }
}

function ensureLifecycleListeners() {
  if (
    lifecycleListenersAttached ||
    typeof window === 'undefined' ||
    typeof window.addEventListener !== 'function'
  ) {
    return;
  }
  lifecycleListenersAttached = true;
  try {
    window.addEventListener('pagehide', flushViaBeacon);
    window.addEventListener('beforeunload', flushViaBeacon);
  } catch {
    // ignore
  }
}

function ensureFlushTimer() {
  if (flushTimer || typeof window === 'undefined') return;
  try {
    flushTimer = setInterval(flushRestoreDiagnosticQueue, FLUSH_INTERVAL_MS);
    if (typeof flushTimer.unref === 'function') flushTimer.unref();
  } catch {
    flushTimer = null;
  }
}

/**
 * Logs one restore diagnostic event: appends to the shared sessionStorage
 * debug buffer and queues a durable relay to /api/terminal/restore-log.
 *
 * @param {string} event
 * @param {Record<string, unknown>} [details]
 * @param {object} [options]
 * @param {boolean} [options.skipSessionBuffer] - relay only; the caller already
 *   wrote the buffer entry (logTerminalSession choke point).
 */
export function logRestoreDiagnostic(event, details = {}, options = {}) {
  if (typeof window === 'undefined') return;
  try {
    const safeEvent = typeof event === 'string' && event ? event : 'unknown';
    let safeDetails = details && typeof details === 'object' ? details : {};
    try {
      JSON.stringify(safeDetails);
    } catch {
      safeDetails = { unserializable: true };
    }

    if (!options.skipSessionBuffer) {
      appendRestoreDebugEntry({ t: new Date().toISOString(), step: safeEvent, ...safeDetails });
    }

    queue.push({ event: safeEvent, details: safeDetails });
    if (queue.length > MAX_QUEUE_ENTRIES) {
      queue.splice(0, queue.length - MAX_QUEUE_ENTRIES);
    }

    ensureLifecycleListeners();
    ensureFlushTimer();
  } catch {
    // never throws
  }
}
