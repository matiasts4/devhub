/**
 * Client-side trace log for terminal session lifecycle (startup restore, relaunch,
 * initialCommand dispatch, OpenCode session detection).
 *
 * Enable in dev by default, or set localStorage devhub_debug_terminal_session=1.
 * Read via: window.__devhubTerminalSessionLogs()
 */

const STORAGE_KEY = 'devhub_terminal_session_debug';
const MAX_ENTRIES = 200;

function isEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.__DEVHUB_TERMINAL_SESSION_DEBUG__ === false) return false;
    if (window.__DEVHUB_TERMINAL_SESSION_DEBUG__ === true) return true;
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') return true;
    return localStorage.getItem('devhub_debug_terminal_session') === '1';
  } catch {
    return false;
  }
}

function readBuffer() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBuffer(entries) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // ignore quota
  }
}

/**
 * @param {string} step
 * @param {Record<string, unknown>} [data]
 */
export function logTerminalSession(step, data = {}) {
  if (!isEnabled()) return;

  const entry = {
    t: new Date().toISOString(),
    step,
    ...data,
  };

  const next = [...readBuffer(), entry];
  writeBuffer(next);

  if (typeof console !== 'undefined' && console.info) {
    console.info(`[terminal-session] ${step}`, data);
  }

  try {
    window.dispatchEvent(new CustomEvent('devhub:terminal-session-debug', { detail: entry }));
  } catch {
    // ignore
  }
}

export function readTerminalSessionLogs(limit = 120) {
  return readBuffer().slice(-limit);
}

export function clearTerminalSessionLogs() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

if (typeof window !== 'undefined') {
  window.__devhubTerminalSessionLogs = readTerminalSessionLogs;
  window.__devhubClearTerminalSessionLogs = clearTerminalSessionLogs;
}
