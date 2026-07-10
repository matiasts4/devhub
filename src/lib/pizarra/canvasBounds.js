/**
 * Canvas bounds utilities — keep live surfaces anchored inside the
 * visible work area so cards cannot be dragged into the void.
 */

const DEFAULT_MIN_VISIBLE = 96;
const DEFAULT_EDGE_MARGIN = 24;

/**
 * Visible canvas region in logical (world) coordinates.
 * Matches the minimap / getVisibleCanvasRegion formula:
 *   worldX = (screenX - canvasRect.left - pan.x) / zoom
 */
export function getVisibleCanvasBounds({
  canvasWidth = 800,
  canvasHeight = 600,
  zoom = 1,
  pan = { x: 0, y: 0 },
} = {}) {
  const z = zoom > 0 ? zoom : 1;
  const panX = pan?.x ?? 0;
  const panY = pan?.y ?? 0;

  return {
    x: -panX / z,
    y: -panY / z,
    width: canvasWidth / z,
    height: canvasHeight / z,
  };
}

/**
 * Clamp an element's top-left so at least `minVisible` px of the card
 * stays inside the visible bounds (with optional edge margin).
 */
export function clampElementPosition(
  { x, y, width = 640, height = 400 },
  bounds,
  { minVisible = DEFAULT_MIN_VISIBLE, margin = DEFAULT_EDGE_MARGIN } = {}
) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const vis = {
    x: (bounds?.x ?? 0) - margin,
    y: (bounds?.y ?? 0) - margin,
    width: (bounds?.width ?? 800) + margin * 2,
    height: (bounds?.height ?? 600) + margin * 2,
  };

  const minX = vis.x - w + minVisible;
  const maxX = vis.x + vis.width - minVisible;
  const minY = vis.y - h + minVisible;
  const maxY = vis.y + vis.height - minVisible;

  return {
    x: Math.round(Math.min(Math.max(x, minX), maxX)),
    y: Math.round(Math.min(Math.max(y, minY), maxY)),
  };
}

/**
 * Clamp element rect (position + size) so it fits inside visible bounds.
 */
export function clampElementRect(
  { x, y, width = 640, height = 400 },
  bounds,
  { minWidth = 160, minHeight = 120, margin = DEFAULT_EDGE_MARGIN } = {}
) {
  const vis = {
    x: (bounds?.x ?? 0) + margin,
    y: (bounds?.y ?? 0) + margin,
    width: Math.max(1, (bounds?.width ?? 800) - margin * 2),
    height: Math.max(1, (bounds?.height ?? 600) - margin * 2),
  };

  let w = Math.max(minWidth, width);
  let h = Math.max(minHeight, height);
  w = Math.min(w, vis.width);
  h = Math.min(h, vis.height);

  const pos = clampElementPosition({ x, y, width: w, height: h }, bounds, {
    minVisible: Math.min(96, w * 0.25, h * 0.25),
    margin: 0,
  });

  return { ...pos, width: Math.round(w), height: Math.round(h) };
}

/**
 * Soft pan clamp — prevent panning so far that the work area feels lost.
 * Keeps at least `minContentVisible` of the content bbox on screen.
 */
export function clampPanToContent({
  pan = { x: 0, y: 0 },
  zoom = 1,
  canvasWidth = 800,
  canvasHeight = 600,
  contentBounds = null,
  minContentVisible = 120,
} = {}) {
  if (!contentBounds) return pan;

  const z = zoom > 0 ? zoom : 1;
  const panX = pan?.x ?? 0;
  const panY = pan?.y ?? 0;

  const contentLeft = contentBounds.x * z + panX;
  const contentTop = contentBounds.y * z + panY;
  const contentRight = (contentBounds.x + contentBounds.width) * z + panX;
  const contentBottom = (contentBounds.y + contentBounds.height) * z + panY;

  let nextX = panX;
  let nextY = panY;

  // Content scrolled too far left — show right edge
  if (contentRight < minContentVisible) {
    nextX = panX + (minContentVisible - contentRight);
  }
  // Content scrolled too far right
  if (contentLeft > canvasWidth - minContentVisible) {
    nextX = panX - (contentLeft - (canvasWidth - minContentVisible));
  }
  // Content scrolled too far up
  if (contentBottom < minContentVisible) {
    nextY = panY + (minContentVisible - contentBottom);
  }
  // Content scrolled too far down
  if (contentTop > canvasHeight - minContentVisible) {
    nextY = panY - (contentTop - (canvasHeight - minContentVisible));
  }

  return { x: nextX, y: nextY };
}

/** Surfaces parked off-screen while layout resolves must not inflate fit bounds. */
export function isLayoutPlacementPlaceholder(el) {
  if (!el || typeof el !== 'object') return true;
  if (el._layoutResolved === false) return true;
  if (typeof el.x === 'number' && el.x < -5000) return true;
  if (typeof el.y === 'number' && el.y < -5000) return true;
  return false;
}

/**
 * Compute bounding box of all elements for pan clamping.
 */
export function computeElementsBounds(elements = [], { padding: pad = 40 } = {}) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    if (isLayoutPlacementPlaceholder(el)) continue;
    if (typeof el.x !== 'number' || typeof el.y !== 'number') continue;
    const w = el.width ?? 640;
    const h = el.height ?? 400;
    if (el.x < minX) minX = el.x;
    if (el.y < minY) minY = el.y;
    if (el.x + w > maxX) maxX = el.x + w;
    if (el.y + h > maxY) maxY = el.y + h;
  }

  if (!isFinite(minX)) return null;

  const margin = typeof pad === 'number' ? pad : 40;
  return {
    x: minX - margin,
    y: minY - margin,
    width: maxX - minX + margin * 2,
    height: maxY - minY + margin * 2,
  };
}

/** Tight bbox from layout slots (used right after auto-fit, before React re-renders). */
export function computeLayoutsBounds(layouts = [], padding = 8) {
  if (!Array.isArray(layouts) || layouts.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const layout of layouts) {
    if (typeof layout.x !== 'number' || typeof layout.y !== 'number') continue;
    const w = layout.width ?? 0;
    const h = layout.height ?? 0;
    if (w <= 0 || h <= 0) continue;
    if (layout.x < minX) minX = layout.x;
    if (layout.y < minY) minY = layout.y;
    if (layout.x + w > maxX) maxX = layout.x + w;
    if (layout.y + h > maxY) maxY = layout.y + h;
  }

  if (!isFinite(minX)) return null;

  const margin = typeof padding === 'number' ? padding : 8;
  return {
    x: minX - margin,
    y: minY - margin,
    width: maxX - minX + margin * 2,
    height: maxY - minY + margin * 2,
  };
}

/**
 * Fit zoom/pan so a world-space bounds rect is centered in the viewport.
 */
export function computeViewportFitToBounds(
  bounds,
  canvasWidth = 800,
  canvasHeight = 600,
  { padding = 48, maxZoom = 1.25, minZoom = 0.12 } = {}
) {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return { zoom: 1, pan: { x: 0, y: 0 } };
  }

  const availW = Math.max(1, canvasWidth - padding * 2);
  const availH = Math.max(1, canvasHeight - padding * 2);
  const z = Math.min(
    maxZoom,
    Math.max(minZoom, Math.min(availW / bounds.width, availH / bounds.height))
  );
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;

  return {
    zoom: z,
    pan: {
      x: canvasWidth / 2 - cx * z,
      y: canvasHeight / 2 - cy * z,
    },
  };
}

/** Prefer tighter layout bounds; fall back to the view region when coords are stale/outliers. */
export function resolveFitBoundsForView(layoutBounds, viewBounds) {
  if (!viewBounds?.width || !viewBounds?.height) {
    return layoutBounds || viewBounds;
  }
  if (!layoutBounds?.width || !layoutBounds?.height) {
    return viewBounds;
  }
  const maxW = viewBounds.width * 1.15;
  const maxH = viewBounds.height * 1.15;
  if (layoutBounds.width <= maxW && layoutBounds.height <= maxH) {
    return layoutBounds;
  }
  return viewBounds;
}

/**
 * Default layout zone anchors inside the visible region.
 * Used for snap targets and visual guides.
 */
export function computeLayoutZones(vis, { gap = 16 } = {}) {
  const x = vis?.x ?? 0;
  const y = vis?.y ?? 0;
  const w = vis?.width ?? 800;
  const h = vis?.height ?? 600;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const halfW = (w - gap) / 2;

  return {
    left: { x: x + gap, y: y + gap, width: halfW - gap, height: h - gap * 2 },
    right: { x: x + halfW + gap, y: y + gap, width: halfW - gap, height: h - gap * 2 },
    center: { x: x + w * 0.15, y: y + h * 0.15, width: w * 0.7, height: h * 0.7 },
    splitLine: cx,
    centerPoint: { x: cx, y: cy },
  };
}

function rectOverlapArea(a, b) {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
}

function pointInsideRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height;
}

/** Placement is position-based on drag; no type→zone binding. */
export function getPreferredZoneForType(_type) {
  return 'center';
}

/** Fit a card rect inside a zone with padding. */
export function fitRectToZone(zone, { minWidth = 160, minHeight = 120, pad = 10 } = {}) {
  const innerW = Math.max(minWidth, zone.width - pad * 2);
  const innerH = Math.max(minHeight, zone.height - pad * 2);
  return {
    x: Math.round(zone.x + pad),
    y: Math.round(zone.y + pad),
    width: Math.round(innerW),
    height: Math.round(innerH),
  };
}

/**
 * Detect which zone the pointer/card center is over (for live highlight).
 */
export function detectZoneAtPoint(cx, cy, zones) {
  if (!zones) return null;
  if (Array.isArray(zones.slots) && zones.slots.length > 0) {
    for (const slot of zones.slots) {
      if (pointInsideRect(cx, cy, slot.rect)) return slot.id;
    }
    return null;
  }
  if (pointInsideRect(cx, cy, zones.left)) return 'left';
  if (pointInsideRect(cx, cy, zones.right)) return 'right';
  if (pointInsideRect(cx, cy, zones.center)) return 'center';
  return null;
}

/**
 * Resolve snap when dropping a card — overlap-based, fills the winning zone.
 * Returns { zone, x, y, width, height } or null if no snap.
 */
export function resolveZoneSnap(
  { x, y, width = 640, height = 400 },
  zones,
  { overlapThreshold = 0.25, centerBias = 0.45 } = {}
) {
  if (!zones) return null;

  const card = { x, y, width, height };
  const cardArea = Math.max(1, width * height);
  const cx = x + width / 2;
  const cy = y + height / 2;

  const entries =
    Array.isArray(zones.slots) && zones.slots.length > 0
      ? zones.slots.map((slot) => [slot.id, slot.rect])
      : [
          ['left', zones.left],
          ['right', zones.right],
          ['center', zones.center],
        ];

  const candidates = [];
  for (const [name, zone] of entries) {
    const overlap = rectOverlapArea(card, zone);
    const ratio = overlap / cardArea;
    const centerInside = pointInsideRect(cx, cy, zone);
    const score = centerInside ? Math.max(ratio, centerBias) : ratio;
    if (score >= overlapThreshold || centerInside) {
      candidates.push({ name, zone, score });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);

  const winner = candidates[0];
  const fitted = fitRectToZone(winner.zone);
  return { zone: winner.name, ...fitted };
}
