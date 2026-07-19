/**
 * Pure SPA helpers for native browser overlay / workspace visibility.
 * No desktop runtime imports — safe for unit tests and React hooks.
 */

/**
 * Whether native browser panels should be bulk-hidden for SPA overlays
 * that paint above the dock (modals, command palette). WebContentsView
 * cannot be stacked under CSS, so the host must collapse the views.
 *
 * @param {{ modalOpen?: boolean, commandPaletteOpen?: boolean }} state
 * @returns {boolean}
 */
export function shouldHideBrowsersForOverlay({
  modalOpen = false,
  commandPaletteOpen = false,
} = {}) {
  return Boolean(modalOpen) || Boolean(commandPaletteOpen);
}

/**
 * Normalize and merge avoid rects (window CSS coords).
 * - Drops invalid / zero-area rects
 * - Dedupes exact duplicates
 * - Does not attempt geometric union (host subtracts each rect)
 *
 * @param {Array<{ x?: number, y?: number, width?: number, height?: number, source?: string }>|null|undefined} rects
 * @returns {Array<{ x: number, y: number, width: number, height: number, source?: string }>}
 */
export function mergeAvoidRects(rects) {
  if (!Array.isArray(rects) || rects.length === 0) return [];

  const seen = new Set();
  const out = [];

  for (const raw of rects) {
    if (!raw || typeof raw !== 'object') continue;
    const x = Math.round(Number(raw.x) || 0);
    const y = Math.round(Number(raw.y) || 0);
    const width = Math.max(0, Math.round(Number(raw.width) || 0));
    const height = Math.max(0, Math.round(Number(raw.height) || 0));
    if (width <= 0 || height <= 0) continue;

    const source = raw.source != null && raw.source !== '' ? String(raw.source) : undefined;
    const key = `${x},${y},${width},${height},${source || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const rect = { x, y, width, height };
    if (source !== undefined) rect.source = source;
    out.push(rect);
  }

  return out;
}

/**
 * Payload for `native_browser_hide_all`.
 * @param {{ reason?: string }} [opts]
 */
export function buildHideAllPayload(opts = {}) {
  const payload = {};
  if (opts.reason != null && opts.reason !== '') {
    payload.reason = String(opts.reason);
  } else {
    payload.reason = 'overlay';
  }
  return payload;
}

/**
 * Payload for `native_browser_show_workspace`.
 * Pass `null` / `undefined` / `''` to restore all (clear workspace filter + bulk hide).
 *
 * @param {string|null|undefined} workspaceId
 * @returns {{ workspaceId: string|null }}
 */
export function buildWorkspaceVisibilityPayload(workspaceId) {
  if (workspaceId == null || workspaceId === '') {
    return { workspaceId: null };
  }
  return { workspaceId: String(workspaceId) };
}
