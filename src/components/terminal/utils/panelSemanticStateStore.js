/**
 * Live semantic agent-TUI state from WS `agent-state` frames (herdr parity).
 */

import { handleAgentStateTransition } from './agentNotificationBridge';

const states = new Map();
const listeners = new Map();

export function getPanelSemanticState(panelId) {
  return states.get(panelId) ?? null;
}

export function setPanelSemanticState(panelId, next, options = {}) {
  const prev = states.get(panelId) ?? null;
  const normalized =
    next && next.agentTuiState
      ? {
          agentTuiState: next.agentTuiState,
          agentTuiStateAt: next.agentTuiStateAt ?? Date.now(),
          reason: options.reason ?? null,
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

  const prevStateStr = prev?.agentTuiState || null;
  const nextStateStr = normalized?.agentTuiState || null;
  const prevReason = prev?.reason || null;
  const nextReason = normalized?.reason || null;

  if (!normalized) {
    states.delete(panelId);
  } else {
    states.set(panelId, normalized);
  }

  const cbs = listeners.get(panelId);
  if (cbs) {
    for (const cb of cbs) {
      try {
        cb(normalized, prev);
      } catch {
        /* ignore */
      }
    }
  }

  const stateChanged = prevStateStr !== nextStateStr;
  // DONE-EVIDENCE-01 reason-upgrade: same state but new evidence (e.g. a
  // quiescence idle upgraded by the real hook Stop) must still reach the
  // bridge so the true "done" can notify exactly once.
  const reasonChanged = !stateChanged && Boolean(nextStateStr) && nextReason !== prevReason;
  if ((stateChanged || reasonChanged) && nextStateStr) {
    handleAgentStateTransition(panelId, prevStateStr, nextStateStr, {
      ...options,
      reason: nextReason,
      reasonChanged,
    });
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
