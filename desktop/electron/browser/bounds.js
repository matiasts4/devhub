'use strict';

/**
 * Pure bounds helpers for WebContentsView placement (CSS pixels).
 * No Electron imports — unit-testable from Jest.
 */

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Normalize a bounds object to integer CSS pixels with non-negative size.
 * @param {object|null|undefined} bounds
 * @returns {{ x: number, y: number, width: number, height: number }|null}
 */
function normalizeBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') return null;
  const x = Math.round(toNumber(bounds.x, 0));
  const y = Math.round(toNumber(bounds.y, 0));
  const width = Math.max(0, Math.round(toNumber(bounds.width, 0)));
  const height = Math.max(0, Math.round(toNumber(bounds.height, 0)));
  return { x, y, width, height };
}

/**
 * Clamp bounds inside the window content size.
 * @param {{ x: number, y: number, width: number, height: number }} bounds
 * @param {{ width: number, height: number }} contentSize
 */
function clampBoundsToContent(bounds, contentSize) {
  const normalized = normalizeBounds(bounds);
  if (!normalized) return null;
  const maxW = Math.max(0, Math.round(toNumber(contentSize?.width, 0)));
  const maxH = Math.max(0, Math.round(toNumber(contentSize?.height, 0)));
  if (maxW === 0 || maxH === 0) return normalized;

  let { x, y, width, height } = normalized;
  width = Math.min(width, maxW);
  height = Math.min(height, maxH);

  x = Math.max(0, Math.min(x, Math.max(0, maxW - width)));

  const maxY = Math.max(0, maxH - height);
  if (y > maxY) {
    if (y < maxH) {
      height = Math.max(0, maxH - y);
    } else {
      y = maxY;
    }
  } else {
    y = Math.max(0, y);
  }

  return { x, y, width, height };
}

/**
 * True when both rects are equal (integer CSS pixels).
 */
function boundsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** Default fixed rect for E0 spike when caller omits bounds. */
function defaultSpikeBounds() {
  return { x: 40, y: 80, width: 960, height: 640 };
}

module.exports = {
  normalizeBounds,
  clampBoundsToContent,
  boundsEqual,
  defaultSpikeBounds,
};
