'use strict';

/**
 * Pure avoid-rect helpers for native browser dock (CSS pixels).
 * No Electron imports — unit-testable from Jest.
 */

const { normalizeBounds } = require('./bounds');

/**
 * @param {object|null|undefined} rect
 * @returns {{ x: number, y: number, width: number, height: number, source?: string }|null}
 */
function normalizeAvoidRect(rect) {
  if (!rect || typeof rect !== 'object') return null;
  const n = normalizeBounds(rect);
  if (!n || n.width <= 0 || n.height <= 0) return null;
  if (rect.source != null && rect.source !== '') {
    return { ...n, source: String(rect.source) };
  }
  return n;
}

/**
 * @param {unknown} rects
 * @returns {Array<{ x: number, y: number, width: number, height: number, source?: string }>}
 */
function normalizeAvoidRects(rects) {
  if (!Array.isArray(rects)) return [];
  const out = [];
  for (const r of rects) {
    const n = normalizeAvoidRect(r);
    if (n) out.push(n);
  }
  return out;
}

function rectArea(r) {
  if (!r) return 0;
  return Math.max(0, r.width) * Math.max(0, r.height);
}

function intersects(a, b) {
  if (!a || !b) return false;
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

/**
 * Clip `inner` to `outer`. Returns null if empty.
 */
function clipTo(inner, outer) {
  if (!inner || !outer) return null;
  const x1 = Math.max(inner.x, outer.x);
  const y1 = Math.max(inner.y, outer.y);
  const x2 = Math.min(inner.x + inner.width, outer.x + outer.width);
  const y2 = Math.min(inner.y + inner.height, outer.y + outer.height);
  const width = x2 - x1;
  const height = y2 - y1;
  if (width <= 0 || height <= 0) return null;
  return { x: x1, y: y1, width, height };
}

/**
 * Subtract one avoid rect from a free rect, returning residual axis-aligned pieces
 * (up to 4: top / bottom / left-band / right-band).
 * @param {{ x: number, y: number, width: number, height: number }} free
 * @param {{ x: number, y: number, width: number, height: number }} avoid
 */
function subtractRect(free, avoid) {
  const hit = clipTo(avoid, free);
  if (!hit) return [free];

  /** @type {Array<{ x: number, y: number, width: number, height: number }>} */
  const residuals = [];

  // Top strip
  if (hit.y > free.y) {
    residuals.push({
      x: free.x,
      y: free.y,
      width: free.width,
      height: hit.y - free.y,
    });
  }

  // Bottom strip
  const freeBottom = free.y + free.height;
  const hitBottom = hit.y + hit.height;
  if (hitBottom < freeBottom) {
    residuals.push({
      x: free.x,
      y: hitBottom,
      width: free.width,
      height: freeBottom - hitBottom,
    });
  }

  // Left band (middle height only — avoids double-counting corners)
  if (hit.x > free.x) {
    residuals.push({
      x: free.x,
      y: hit.y,
      width: hit.x - free.x,
      height: hit.height,
    });
  }

  // Right band
  const freeRight = free.x + free.width;
  const hitRight = hit.x + hit.width;
  if (hitRight < freeRight) {
    residuals.push({
      x: hitRight,
      y: hit.y,
      width: freeRight - hitRight,
      height: hit.height,
    });
  }

  return residuals.filter((r) => r.width > 0 && r.height > 0);
}

/**
 * Compute largest non-overlapping sub-rect of `bounds` after subtracting avoid rects.
 *
 * Strategy (E2 simple):
 * 1. Iteratively subtract each avoid rect from free regions.
 * 2. Pick the residual with maximum area.
 * 3. If remaining area ratio is below `minAreaRatio` (default 0.2) or size is
 *    below min width/height, signal `hide: true` so the host can temporarily
 *    collapse the WebContentsView instead of showing a tiny sliver.
 *
 * @param {object} bounds panel logical bounds (window CSS coords)
 * @param {unknown} avoidRects
 * @param {{ minAreaRatio?: number, minWidth?: number, minHeight?: number }} [options]
 * @returns {{
 *   originalBounds: { x: number, y: number, width: number, height: number }|null,
 *   effectiveBounds: { x: number, y: number, width: number, height: number }|null,
 *   hide: boolean,
 *   areaRatio: number
 * }}
 */
function applyAvoidRects(bounds, avoidRects, options = {}) {
  const original = normalizeBounds(bounds);
  if (!original || original.width <= 0 || original.height <= 0) {
    return { originalBounds: original, effectiveBounds: null, hide: true, areaRatio: 0 };
  }

  const avoids = normalizeAvoidRects(avoidRects);
  if (avoids.length === 0) {
    return {
      originalBounds: original,
      effectiveBounds: { ...original },
      hide: false,
      areaRatio: 1,
    };
  }

  /** @type {Array<{ x: number, y: number, width: number, height: number }>} */
  let free = [original];
  for (const avoid of avoids) {
    const next = [];
    for (const region of free) {
      next.push(...subtractRect(region, avoid));
    }
    free = next;
    if (free.length === 0) break;
  }

  let best = null;
  let bestArea = 0;
  for (const region of free) {
    const a = rectArea(region);
    if (a > bestArea) {
      bestArea = a;
      best = region;
    }
  }

  const originalArea = rectArea(original);
  const areaRatio = originalArea > 0 ? bestArea / originalArea : 0;
  const minRatio = options.minAreaRatio != null ? Number(options.minAreaRatio) : 0.2;
  const minWidth = options.minWidth != null ? Number(options.minWidth) : 40;
  const minHeight = options.minHeight != null ? Number(options.minHeight) : 40;

  if (!best || areaRatio < minRatio || best.width < minWidth || best.height < minHeight) {
    return {
      originalBounds: original,
      effectiveBounds: best,
      hide: true,
      areaRatio,
    };
  }

  return {
    originalBounds: original,
    effectiveBounds: best,
    hide: false,
    areaRatio,
  };
}

module.exports = {
  normalizeAvoidRect,
  normalizeAvoidRects,
  rectArea,
  intersects,
  clipTo,
  subtractRect,
  applyAvoidRects,
};
