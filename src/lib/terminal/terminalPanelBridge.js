/**
 * Module-level bridge for terminal panel session state that must survive
 * a TerminalTTY unmount/remount (e.g. workspace grid → pizarra canvas).
 */

const bridges = new Map();

export function stashTerminalPanelBridge(panelId, snapshot = {}) {
  if (!panelId) return;
  bridges.set(panelId, {
    panelId,
    buffer: typeof snapshot.buffer === 'string' ? snapshot.buffer : '',
    catchupPending: Boolean(snapshot.catchupPending),
    outputPending: typeof snapshot.outputPending === 'string' ? snapshot.outputPending : '',
    lastPtySize: snapshot.lastPtySize || { cols: 0, rows: 0 },
    host: snapshot.host || null,
    reason: snapshot.reason || 'dispose',
    stashedAt: Date.now(),
  });
}

export function takeTerminalPanelBridge(panelId) {
  if (!panelId) return null;
  const snapshot = bridges.get(panelId);
  if (!snapshot) return null;
  bridges.delete(panelId);
  return snapshot;
}
