/**
 * terminalViewportSnapshot — pizarra-instant-enter A5 ("aparecer ya").
 *
 * Captures a TEXT ghost of the xterm viewport at the moment a TerminalTTY
 * is torn down (portal retarget workspace↔pizarra remounts the component;
 * hide/close disposes it). The next pizarra entry renders the ghost
 * instantly inside the surface card and crossfades to the live terminal
 * once the retarget + fit + repaint chain has landed.
 *
 * Why text and not pixels: the default renderer is xterm-webgl, whose
 * canvas is constructed WITHOUT preserveDrawingBuffer, so a toDataURL /
 * drawImage readback after the frame is composited returns a blank
 * bitmap. The xterm buffer is renderer-agnostic (webgl / canvas / dom),
 * always readable, and cheap to copy (~viewport rows × cols).
 *
 * Lifecycle:
 *   - captureTerminalViewportSnapshot(panelId, term) — called from the
 *     TerminalTTY engine dispose path while the term instance is alive.
 *   - getTerminalViewportSnapshot(panelId) — TTL-checked peek used by the
 *     ghost overlay at mount.
 *   - clearTerminalViewportSnapshot(panelId) — called by the ghost once
 *     the live surface has faded in, and on hard teardown.
 */

export const SNAPSHOT_TTL_MS = 45_000;
export const MAX_SNAPSHOT_ROWS = 80;

const snapshots = new Map();

/**
 * Defensive viewport read. Returns an array of visible rows (right-trimmed,
 * trailing blank rows dropped). Returns [] for anything that does not look
 * like a live xterm instance — never throws.
 */
export function readViewportRowsFromTerm(term) {
  try {
    const buffer = term?.buffer?.active;
    if (!buffer || typeof buffer.getLine !== 'function') return [];
    const totalRows = typeof term.rows === 'number' && term.rows > 0 ? term.rows : 24;
    const viewportY = typeof buffer.viewportY === 'number' ? buffer.viewportY : 0;
    const limit = Math.min(totalRows, MAX_SNAPSHOT_ROWS);
    const rows = [];
    for (let i = 0; i < limit; i += 1) {
      const line = buffer.getLine(viewportY + i);
      if (!line || typeof line.translateToString !== 'function') {
        rows.push('');
        continue;
      }
      rows.push(line.translateToString(true).replace(/\s+$/u, ''));
    }
    while (rows.length > 0 && rows[rows.length - 1] === '') rows.pop();
    return rows;
  } catch {
    return [];
  }
}

export function saveTerminalViewportSnapshot(panelId, rows) {
  if (!panelId || !Array.isArray(rows) || rows.length === 0) return null;
  const snapshot = {
    rows: rows.slice(0, MAX_SNAPSHOT_ROWS),
    capturedAt: Date.now(),
  };
  snapshots.set(panelId, snapshot);
  return snapshot;
}

/**
 * Capture straight from a live xterm instance. No-op (returns null) when
 * there is no readable content — an empty ghost would only paint chrome.
 */
export function captureTerminalViewportSnapshot(panelId, term) {
  const rows = readViewportRowsFromTerm(term);
  if (rows.length === 0) return null;
  return saveTerminalViewportSnapshot(panelId, rows);
}

/** TTL-checked peek. Expired entries are dropped eagerly. */
export function getTerminalViewportSnapshot(panelId) {
  if (!panelId) return null;
  const snapshot = snapshots.get(panelId);
  if (!snapshot) return null;
  if (Date.now() - snapshot.capturedAt > SNAPSHOT_TTL_MS) {
    snapshots.delete(panelId);
    return null;
  }
  return snapshot;
}

export function clearTerminalViewportSnapshot(panelId) {
  if (!panelId) return;
  snapshots.delete(panelId);
}

/** Test-only */
export function _resetTerminalViewportSnapshotsForTests() {
  snapshots.clear();
}
