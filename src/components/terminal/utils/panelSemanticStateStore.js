/**
 * Live semantic agent-TUI state from WS `agent-state` frames (herdr parity).
 */

const states = new Map();
const listeners = new Map();

export function getPanelSemanticState(panelId) {
  return states.get(panelId) ?? null;
}

export function setPanelSemanticState(panelId, next) {
  const prev = states.get(panelId) ?? null;
  const normalized =
    next && next.agentTuiState
      ? {
          agentTuiState: next.agentTuiState,
          agentTuiStateAt: next.agentTuiStateAt ?? Date.now(),
        }
      : null;

  if (
    prev &&
    normalized &&
    prev.agentTuiState === normalized.agentTuiState &&
    prev.agentTuiStateAt === normalized.agentTuiStateAt
  ) {
    return;
  }

  if (!normalized) {
    states.delete(panelId);
  } else {
    states.set(panelId, normalized);
  }

  const cbs = listeners.get(panelId);
  if (cbs) {
    for (const cb of cbs) {
      try {
        cb();
      } catch {
        /* ignore */
      }
    }
  }
}

export function subscribePanelSemanticState(panelId, cb) {
  let cbs = listeners.get(panelId);
  if (!cbs) {
    cbs = new Set();
    listeners.set(panelId, cbs);
  }
  cbs.add(cb);
  return () => {
    const set = listeners.get(panelId);
    if (set) {
      set.delete(cb);
      if (set.size === 0) listeners.delete(panelId);
    }
  };
}

export function clearPanelSemanticState(panelId) {
  setPanelSemanticState(panelId, null);
}
