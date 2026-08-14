/**
 * Client-side trace log for terminal session lifecycle (startup restore, relaunch,
 * initialCommand dispatch, OpenCode session detection).
 *
 * Enable in dev by default, or set localStorage devhub_debug_terminal_session=1.
 * Read via: window.__devhubTerminalSessionLogs()
 *
 * Every entry is ALSO forwarded to logRestoreDiagnostic (durable file relay via
 * /api/terminal/restore-log) regardless of the debug flag — the restore
 * decision trail is needed most after app restarts, when this sessionStorage
 * buffer is already gone. The shared buffer helpers live in
 * src/lib/terminal/restoreDiagnostics.js (this module imports them; the
 * reverse import is forbidden — circular).
 */

import {
  appendRestoreDebugEntry,
  logRestoreDiagnostic,
  readRestoreDebugEntries,
  RESTORE_DEBUG_STORAGE_KEY,
} from '@/lib/terminal/restoreDiagnostics';
import {
  getRegisteredTerminalInstances,
  probeTerminalRenderIntegrity,
} from '@/components/terminal/TerminalTTY.helpers';

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

/**
 * @param {string} step
 * @param {Record<string, unknown>} [data]
 */
export function logTerminalSession(step, data = {}) {
  // Durable restore relay — intentionally outside the isEnabled() gate so the
  // restore decision trail reaches the on-disk log even in production.
  // skipSessionBuffer: the gated write below stays the single buffer writer.
  logRestoreDiagnostic(step, data, { skipSessionBuffer: true });

  if (!isEnabled()) return;

  const entry = {
    t: new Date().toISOString(),
    step,
    ...data,
  };

  appendRestoreDebugEntry(entry);

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
  return readRestoreDebugEntries().slice(-limit);
}

export function clearTerminalSessionLogs() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(RESTORE_DEBUG_STORAGE_KEY);
  } catch {
    // ignore
  }
}

if (typeof window !== 'undefined') {
  window.__devhubTerminalSessionLogs = readTerminalSessionLogs;
  window.__devhubClearTerminalSessionLogs = clearTerminalSessionLogs;
  window.__devhubTerminalCorruptionReport = () => {
    const instances = getRegisteredTerminalInstances();
    const results = [];
    for (const [panelId, refs] of instances) {
      const report = probeTerminalRenderIntegrity({
        term: refs.termRef?.current,
        container: refs.containerRef?.current,
        fitAddon: refs.fitRef?.current,
        operationalRendererMode: refs.operationalRendererModeRef?.current,
        webglAddon: refs.webglAddonRef?.current,
        canvasAddon: refs.canvasAddonRef?.current,
        lastPtySize: refs.lastPtySizeRef?.current,
      });
      results.push({ panelId, ...report });
    }
    const corrupted = results.filter((r) => !r.healthy);
    const summary = {
      total: results.length,
      healthy: results.length - corrupted.length,
      corrupted: corrupted.length,
      panels: results,
    };
    logTerminalSession('manual-corruption-report', summary);
    if (corrupted.length > 0) {
      console.warn('[terminal-corruption] Issues detected:', corrupted);
    } else {
      console.info('[terminal-corruption] All panels healthy.', summary);
    }
    return summary;
  };
}
