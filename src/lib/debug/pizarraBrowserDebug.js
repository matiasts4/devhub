/**
 * Client-side trace log for Zed open_url → pizarra browser pipeline.
 * Ring buffer in sessionStorage + console in dev. Read via:
 *   window.__devhubPizarraBrowserLogs()
 */

const STORAGE_KEY = 'devhub_pizarra_browser_debug';
const MAX_ENTRIES = 120;

function isEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.__DEVHUB_PIZARRA_BROWSER_DEBUG__ === false) return false;
    if (window.__DEVHUB_PIZARRA_BROWSER_DEBUG__ === true) return true;
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') return true;
    return localStorage.getItem('devhub_debug_pizarra_browser') === '1';
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
export function logPizarraBrowser(step, data = {}) {
  if (!isEnabled()) return;

  const entry = {
    t: new Date().toISOString(),
    step,
    ...data,
  };

  const next = [...readBuffer(), entry];
  writeBuffer(next);

  if (typeof console !== 'undefined' && console.info) {
    console.info(`[pizarra-browser] ${step}`, data);
  }

  try {
    window.dispatchEvent(new CustomEvent('devhub:pizarra-browser-debug', { detail: entry }));
  } catch {
    // ignore
  }
}

export function readPizarraBrowserLogs(limit = 80) {
  return readBuffer().slice(-limit);
}

export function clearPizarraBrowserLogs() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

if (typeof window !== 'undefined') {
  window.__devhubPizarraBrowserLogs = readPizarraBrowserLogs;
  window.__devhubClearPizarraBrowserLogs = clearPizarraBrowserLogs;
}
