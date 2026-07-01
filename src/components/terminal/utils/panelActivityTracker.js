/**
 * panelActivityTracker — per-connection state machine that translates PTY WS
 * frames into running/idle transitions on panelActivityStore.
 *
 * Pure and fake-timer-testable via injected now/setTimeout/clearTimeout.
 * Agent-agnostic: no per-TUI patterns, only noise filter + size threshold +
 * redraw detection.
 */

import {
  ACTIVITY_DEBOUNCE_MS,
  NOISE_MIN_BYTES,
  BOOTSTRAP_WINDOW_MS,
  PURE_NOISE_RE,
  setPanelActivity,
  getPanelActivity,
} from './panelActivityStore';

const ANSI_RE =
  // eslint-disable-next-line no-control-regex -- ANSI escape sequences require control chars
  /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[=>N]|\r/g;

function stripAnsi(text) {
  return text.replace(ANSI_RE, '');
}

export function createPanelActivityTracker(
  panelId,
  {
    debounceMs = ACTIVITY_DEBOUNCE_MS,
    noiseMinBytes = NOISE_MIN_BYTES,
    bootstrapMs = BOOTSTRAP_WINDOW_MS,
    setTimeout: st = setTimeout,
    clearTimeout: ct = clearTimeout,
  } = {}
) {
  let debounceTimer = null;
  let bootstrapTimer = null;
  let disposed = false;
  let readyReceived = false;
  let lastVisibleText = '';

  function clearDebounce() {
    if (debounceTimer !== null) {
      ct(debounceTimer);
      debounceTimer = null;
    }
  }

  function clearBootstrap() {
    if (bootstrapTimer !== null) {
      ct(bootstrapTimer);
      bootstrapTimer = null;
    }
  }

  function isSubstantial(data) {
    if (typeof data !== 'string') return false;
    if (data.length < noiseMinBytes) return false;
    if (PURE_NOISE_RE.test(data)) return false;
    const visible = stripAnsi(data).trim();
    if (visible.length === 0) return false;
    if (visible === lastVisibleText) return false;
    lastVisibleText = visible;
    return true;
  }

  function armDebounce() {
    clearDebounce();
    debounceTimer = st(() => {
      debounceTimer = null;
      if (disposed) return;
      setPanelActivity(panelId, 'idle');
    }, debounceMs);
  }

  function promoteRunning() {
    if (disposed) return;
    clearBootstrap();
    if (getPanelActivity(panelId) !== 'running') {
      setPanelActivity(panelId, 'running');
    }
    armDebounce();
  }

  return {
    onOpen() {
      if (disposed) return;
      readyReceived = false;
      lastVisibleText = '';
      setPanelActivity(panelId, 'idle');
      clearBootstrap();
      bootstrapTimer = st(() => {
        bootstrapTimer = null;
      }, bootstrapMs);
    },

    onFrame(type, data) {
      if (disposed || !readyReceived) return;
      if (type !== 'output' && type !== 'raw') return;
      if (!isSubstantial(data)) return;
      promoteRunning();
    },

    onReady(payload) {
      if (disposed) return;
      readyReceived = true;
      clearBootstrap();
      const reattached = Boolean(payload?.reattached);
      const ageMs = payload?.lastActivityAgeMs;
      if (reattached && typeof ageMs === 'number' && ageMs >= 0 && ageMs <= debounceMs) {
        if (getPanelActivity(panelId) !== 'running') {
          setPanelActivity(panelId, 'running');
        }
        armDebounce();
      }
    },

    onClose() {
      if (disposed) return;
      clearDebounce();
      clearBootstrap();
      setPanelActivity(panelId, 'idle');
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      clearDebounce();
      clearBootstrap();
    },
  };
}
