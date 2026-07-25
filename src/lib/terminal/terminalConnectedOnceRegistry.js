/**
 * Module-level record of panels that reached `connected` at least once (PR5
 * terminal-load-performance). TerminalTTY remounts (workspace tab switch,
 * pizarra enter/exit, v2 graveyard restore) create fresh React state; this
 * registry lets a remount know the panel already booted so the full-screen
 * "Conectando…" overlay stays hidden and the WS reconnect is not deferred.
 *
 * Cleanup: handleClosePanel clears the id on real panel close. A FIFO cap
 * bounds the map for closes that bypass handleClosePanel (workspace delete,
 * project switch, HMR) so ids cannot leak unboundedly.
 */

export const TERMINAL_CONNECTED_ONCE_MAX_PANELS = 200;

const connectedOnceByPanelId = new Map();

export function hasTerminalConnectedOnce(panelId) {
  return Boolean(panelId) && connectedOnceByPanelId.has(panelId);
}

export function markTerminalConnectedOnce(panelId) {
  if (!panelId || connectedOnceByPanelId.has(panelId)) return;
  connectedOnceByPanelId.set(panelId, true);
  if (connectedOnceByPanelId.size > TERMINAL_CONNECTED_ONCE_MAX_PANELS) {
    const oldest = connectedOnceByPanelId.keys().next().value;
    connectedOnceByPanelId.delete(oldest);
  }
}

export function clearTerminalConnectedOnce(panelId) {
  if (!panelId) return;
  connectedOnceByPanelId.delete(panelId);
}

/** Test-only */
export function _resetTerminalConnectedOnceForTests() {
  connectedOnceByPanelId.clear();
}
