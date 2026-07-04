/**
 * v2Graveyard.js — hidden surface registry for terminal-engine-v2 panels.
 *
 * When a v2 panel is hidden or closed, its xterm surface (xterm instance +
 * renderer addons + container) is moved to the graveyard instead of being
 * disposed. The PTY stays alive in the sidecar. When the panel is reshown,
 * the surface can be restored from the graveyard, avoiding a full rebuild.
 *
 * Phase 5: LRU cap evicts the oldest stashed surface when the registry
 * exceeds V2_GRAVEYARD_LRU_CAP entries.
 */

/** @type {number} Maximum number of hidden v2 surfaces kept in the graveyard. */
export const V2_GRAVEYARD_LRU_CAP = 12;

const stash = new Map();
let hiddenHost = null;

function ensureHiddenHost() {
  if (hiddenHost) return hiddenHost;
  const doc = typeof globalThis !== 'undefined' ? globalThis.document : undefined;
  if (!doc) return null;

  hiddenHost = doc.createElement('div');
  hiddenHost.setAttribute('aria-hidden', 'true');
  hiddenHost.style.cssText = [
    'position: fixed',
    'left: -9999px',
    'top: 0',
    'width: 1px',
    'height: 1px',
    'overflow: hidden',
    'visibility: hidden',
    'pointer-events: none',
  ].join(';');

  doc.body.appendChild(hiddenHost);
  return hiddenHost;
}

export function resetHiddenHostForTests() {
  hiddenHost = null;
}

/**
 * Evict the oldest stashed surface(s) when the registry exceeds the LRU cap.
 *
 * @returns {string[]} session ids that were evicted
 */
export function evictOldestIfNeeded() {
  const evicted = [];
  while (stash.size > V2_GRAVEYARD_LRU_CAP) {
    const oldest = stash.keys().next().value;
    if (oldest == null) break;
    disposeSurface(oldest);
    evicted.push(oldest);
  }
  return evicted;
}

/**
 * Stash a terminal surface in the hidden registry.
 *
 * @param {string} sessionId
 * @param {object} surface
 * @param {import('xterm').Terminal} surface.termInstance
 * @param {object} [surface.webglAddon]
 * @param {object} [surface.canvasAddon]
 * @param {object} [surface.serializeAddon]
 * @param {import('xterm-addon-fit').FitAddon} [surface.fitAddon]
 * @param {import('xterm-addon-search').SearchAddon} [surface.searchAddon]
 * @param {HTMLElement} [surface.container]
 * @param {object} [surface.metadata]
 * @returns {boolean}
 */
export function stashSurface(sessionId, surface) {
  if (!sessionId || !surface?.termInstance) return false;

  // Evict any previous surface for this session id to keep the stash 1:1.
  disposeSurface(sessionId);

  const host = ensureHiddenHost();
  if (host && surface.container) {
    try {
      host.appendChild(surface.container);
    } catch {
      // Container may already be detached; keep the surface refs anyway.
    }
  }

  stash.set(sessionId, {
    ...surface,
    stashedAt: Date.now(),
  });

  evictOldestIfNeeded();

  return true;
}

/**
 * Restore a stashed surface and remove it from the registry.
 *
 * @param {string} sessionId
 * @returns {object|null}
 */
export function restoreSurface(sessionId) {
  if (!sessionId) return null;
  const surface = stash.get(sessionId);
  if (!surface) return null;
  stash.delete(sessionId);
  return surface;
}

/**
 * Check whether a surface is currently stashed.
 *
 * @param {string} sessionId
 * @returns {boolean}
 */
export function hasSurface(sessionId) {
  if (!sessionId) return false;
  return stash.has(sessionId);
}

/**
 * List all stashed session ids (debug/tests).
 *
 * @returns {string[]}
 */
export function listStashed() {
  return [...stash.keys()];
}

/**
 * Permanently dispose a stashed surface.
 *
 * @param {string} sessionId
 * @returns {boolean}
 */
export function disposeSurface(sessionId) {
  if (!sessionId) return false;
  const surface = stash.get(sessionId);
  if (!surface) return false;

  stash.delete(sessionId);

  try {
    surface.webglAddon?.dispose?.();
  } catch {
    // ignore disposal errors
  }
  try {
    surface.canvasAddon?.dispose?.();
  } catch {
    // ignore disposal errors
  }
  try {
    surface.serializeAddon?.dispose?.();
  } catch {
    // ignore disposal errors
  }
  try {
    surface.fitAddon?.dispose?.();
  } catch {
    // ignore disposal errors
  }
  try {
    surface.searchAddon?.dispose?.();
  } catch {
    // ignore disposal errors
  }
  try {
    surface.termInstance?.dispose?.();
  } catch {
    // ignore disposal errors
  }

  if (surface.container?.parentNode) {
    try {
      surface.container.parentNode.removeChild(surface.container);
    } catch {
      // ignore
    }
  }

  return true;
}

/**
 * Dispose every stashed surface. Used in tests and app shutdown paths.
 */
export function disposeAllSurfaces() {
  for (const sessionId of stash.keys()) {
    disposeSurface(sessionId);
  }
}
