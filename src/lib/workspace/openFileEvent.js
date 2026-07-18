/**
 * Browser event contract for opening a file in the workspace Files space.
 * Producers: agent terminal link provider (Grok/OpenCode).
 * Consumers: TerminalWorkspacesManager (ensure files panel) + FileExplorerEditorPane.
 */

export const OPEN_FILE_EVENT = 'devhub:open-file';

/** @type {Map<string, object>} */
const pendingByKey = new Map();

/**
 * @param {unknown} detail
 * @returns {boolean}
 */
export function isValidOpenFileEvent(detail) {
  if (!detail || typeof detail !== 'object') return false;
  const path = detail.path;
  return typeof path === 'string' && path.trim().length > 0;
}

/**
 * @param {object} detail
 * @returns {boolean} true if dispatched
 */
export function dispatchOpenFile(detail) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return false;
  }
  if (!isValidOpenFileEvent(detail)) return false;
  try {
    window.dispatchEvent(
      new CustomEvent(OPEN_FILE_EVENT, {
        detail: {
          path: String(detail.path).trim(),
          line: Number.isFinite(Number(detail.line)) ? Number(detail.line) : undefined,
          column: Number.isFinite(Number(detail.column)) ? Number(detail.column) : undefined,
          base: typeof detail.base === 'string' ? detail.base : undefined,
          source: typeof detail.source === 'string' ? detail.source : undefined,
          projectId: detail.projectId ?? undefined,
          workspaceId: typeof detail.workspaceId === 'string' ? detail.workspaceId : undefined,
          panelId: typeof detail.panelId === 'string' ? detail.panelId : undefined,
        },
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} key workspace or project key
 * @param {object} detail
 */
export function reservePendingOpenFile(key, detail) {
  if (!key || !isValidOpenFileEvent(detail)) return;
  pendingByKey.set(String(key), {
    path: String(detail.path).trim(),
    line: Number.isFinite(Number(detail.line)) ? Number(detail.line) : undefined,
    column: Number.isFinite(Number(detail.column)) ? Number(detail.column) : undefined,
    base: typeof detail.base === 'string' ? detail.base : undefined,
    source: typeof detail.source === 'string' ? detail.source : undefined,
    reservedAt: Date.now(),
  });
}

/**
 * @param {string} key
 * @returns {object|null}
 */
export function consumePendingOpenFile(key) {
  if (!key) return null;
  const k = String(key);
  const v = pendingByKey.get(k) || null;
  if (v) pendingByKey.delete(k);
  return v;
}

/**
 * @param {string} key
 * @returns {object|null}
 */
export function peekPendingOpenFile(key) {
  if (!key) return null;
  return pendingByKey.get(String(key)) || null;
}

/** Test helper */
export function clearPendingOpenFiles() {
  pendingByKey.clear();
}
