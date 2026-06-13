/**
 * usePizarraMinimap — minimap HUD state + coordinate translators.
 *
 * pizarra-minimap: keeps the bottom-right minimap hidden by default, surfaces
 * it on any pan/zoom change, then auto-hides after `idleMs` of no activity.
 *
 * No JSX in this file — pure JS hook so it can be unit-tested without a DOM.
 *
 * Coordinate system (matches PizarraCanvas wrapper):
 *   world→screen:  screenX = worldX * zoom + pan.x
 *   screen→world:  worldX = (screenX - pan.x) / zoom
 *
 * The minimap itself is a fixed-size (180x120) panel. The "world" inside
 * that panel is `worldBounds` (union of all element bboxes + padding,
 * clamped to a minimum 400x300). The visible-rect indicator maps from
 * `visibleWorldRect` (the area of the world currently in the user's
 * viewport) into minimap-pixel space.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCanvasViewport } from '@/lib/pizarra/canvasViewport';

// Composite shapes don't have a Konva bbox; use the same defaults the
// shape factory uses so the minimap matches what the user sees on the
// canvas. Keep these in sync with shapeModel.js.
const COMPOSITE_DEFAULTS = {
  terminal: { width: 640, height: 400 },
  browser: { width: 1024, height: 700 },
};

const MINIMAP_DEFAULT_BOUNDS = { x: -400, y: -300, width: 800, height: 600 };
const MIN_WORLD_WIDTH = 400;
const MIN_WORLD_HEIGHT = 300;
const DEFAULT_FALLBACK_CANVAS_RECT = { left: 0, top: 0, width: 800, height: 600 };

/**
 * Compute the axis-aligned bbox of a single shape in world coordinates.
 * Returns null for unknown / malformed shapes.
 */
function elementBbox(element) {
  if (!element || typeof element.x !== 'number' || typeof element.y !== 'number') {
    return null;
  }
  const x = element.x;
  const y = element.y;

  switch (element.type) {
    case 'rect': {
      const w = typeof element.width === 'number' ? element.width : 0;
      const h = typeof element.height === 'number' ? element.height : 0;
      return { x, y, width: w, height: h };
    }
    case 'circle': {
      const r = typeof element.radius === 'number' ? element.radius : 0;
      return { x: x - r, y: y - r, width: r * 2, height: r * 2 };
    }
    case 'line':
    case 'arrow': {
      const points = Array.isArray(element.points) ? element.points : [];
      if (points.length < 2) {
        return { x, y, width: 0, height: 0 };
      }
      // points is an alternating [x0,y0,x1,y1,...] array in shape-local
      // coords; add the shape's (x,y) origin to get world coords.
      let minX = x + points[0];
      let minY = y + points[1];
      let maxX = minX;
      let maxY = minY;
      for (let i = 2; i + 1 < points.length; i += 2) {
        const px = x + points[i];
        const py = y + points[i + 1];
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    case 'textbox': {
      const fontSize = typeof element.fontSize === 'number' ? element.fontSize : 16;
      const w = typeof element.width === 'number' && element.width > 0 ? element.width : 120;
      const h = fontSize * 1.4;
      return { x, y, width: w, height: h };
    }
    case 'terminal':
    case 'browser': {
      const defaults = COMPOSITE_DEFAULTS[element.type] || COMPOSITE_DEFAULTS.terminal;
      return {
        x,
        y,
        width: typeof element.width === 'number' && element.width > 0 ? element.width : defaults.width,
        height:
          typeof element.height === 'number' && element.height > 0 ? element.height : defaults.height,
      };
    }
    default:
      return null;
  }
}

/**
 * Union of all element bboxes. Adds `padding` on every side and clamps
 * the result to at least 400x300 so the minimap is always useful.
 */
function computeWorldBounds(elements, padding) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const element of elements || []) {
    const b = elementBbox(element);
    if (!b) continue;
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }

  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    // Empty / all-malformed — return the sensible default.
    return { ...MINIMAP_DEFAULT_BOUNDS };
  }

  const pad = typeof padding === 'number' ? padding : 80;
  let x = minX - pad;
  let y = minY - pad;
  let width = maxX - minX + pad * 2;
  let height = maxY - minY + pad * 2;

  if (width < MIN_WORLD_WIDTH) {
    const diff = MIN_WORLD_WIDTH - width;
    x -= diff / 2;
    width = MIN_WORLD_WIDTH;
  }
  if (height < MIN_WORLD_HEIGHT) {
    const diff = MIN_WORLD_HEIGHT - height;
    y -= diff / 2;
    height = MIN_WORLD_HEIGHT;
  }

  return { x, y, width, height };
}

/**
 * Map (minimapX, minimapY) in minimap-pixel space (origin = top-left of
 * the minimap content area) to (worldX, worldY) in world coordinates.
 */
function makeMinimapToWorld(bounds, innerWidth, innerHeight) {
  return (mx, my) => {
    const fx = innerWidth > 0 ? mx / innerWidth : 0;
    const fy = innerHeight > 0 ? my / innerHeight : 0;
    return {
      x: bounds.x + fx * bounds.width,
      y: bounds.y + fy * bounds.height,
    };
  };
}

/**
 * Map (worldX, worldY) to (minimapX, minimapY) in minimap-pixel space.
 */
function makeWorldToMinimap(bounds, innerWidth, innerHeight) {
  return (wx, wy) => {
    const fx = bounds.width > 0 ? (wx - bounds.x) / bounds.width : 0;
    const fy = bounds.height > 0 ? (wy - bounds.y) / bounds.height : 0;
    return {
      x: fx * innerWidth,
      y: fy * innerHeight,
    };
  };
}

export default function usePizarraMinimap({
  elements,
  onSelectElement,
  idleMs = 1500,
  padding = 80,
} = {}) {
  const { zoom, setPan, canvasRect } = useCanvasViewport();
  // pan is read each render to compute visibleWorldRect; we don't need
  // the setter for that. The hook subscribes to pan changes via a
  // useEffect that compares the previous value to the current one.
  const { pan } = useCanvasViewport();

  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);
  const isHoveredRef = useRef(false);
  const lastPanRef = useRef(pan);
  const lastZoomRef = useRef(zoom);

  const onMouseEnter = useCallback(() => {
    isHoveredRef.current = true;
    setVisible(true);
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onMouseLeave = useCallback(() => {
    isHoveredRef.current = false;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setVisible(false);
      timerRef.current = null;
    }, idleMs);
  }, [idleMs]);

  // Surface the minimap on every pan/zoom change, then auto-hide after idleMs.
  useEffect(() => {
    const panChanged =
      !lastPanRef.current || lastPanRef.current.x !== pan.x || lastPanRef.current.y !== pan.y;
    const zoomChanged = lastZoomRef.current !== zoom;

    if (!panChanged && !zoomChanged) return;
    lastPanRef.current = pan;
    lastZoomRef.current = zoom;

    setVisible(true);
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    if (!isHoveredRef.current) {
      timerRef.current = setTimeout(() => {
        setVisible(false);
        timerRef.current = null;
      }, idleMs);
    }

    return () => {
      // No cleanup on every change — only the unmount effect clears the timer.
    };
  }, [pan, zoom, idleMs]);

  // On unmount: clear the timer so we don't try to setState on an unmounted tree.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // ── worldBounds ─────────────────────────────────────────────────────────
  const worldBounds = useMemo(
    () => computeWorldBounds(elements, padding),
    [elements, padding]
  );

  // ── visibleWorldRect ────────────────────────────────────────────────────
  // What part of the world is currently visible on screen.
  const visibleWorldRect = useMemo(() => {
    const cr = canvasRect || DEFAULT_FALLBACK_CANVAS_RECT;
    const w = cr.width || DEFAULT_FALLBACK_CANVAS_RECT.width;
    const h = cr.height || DEFAULT_FALLBACK_CANVAS_RECT.height;
    return {
      x: -pan.x / (zoom || 1),
      y: -pan.y / (zoom || 1),
      width: w / (zoom || 1),
      height: h / (zoom || 1),
    };
  }, [pan, zoom, canvasRect]);

  // Coordinate translators — use the content-inner size (180x108 minus
  // padding) so the component can render elements at minimap pixel
  // positions. The component passes the actual size; we default to
  // 180x108 (180 - 6*2 - label height ~12) when the component hasn't
  // told us yet. Callers can call these with whatever inner size they
  // rendered to; if they don't, the defaults below keep the API
  // forgiving.
  const innerWidth = 180 - 12; // 6px padding * 2
  const innerHeight = 120 - 12 - 12; // padding + label
  const minimapToWorld = useMemo(
    () => makeMinimapToWorld(worldBounds, innerWidth, innerHeight),
    [worldBounds, innerWidth, innerHeight]
  );
  const worldToMinimap = useMemo(
    () => makeWorldToMinimap(worldBounds, innerWidth, innerHeight),
    [worldBounds, innerWidth, innerHeight]
  );

  // ── handlePanTo ─────────────────────────────────────────────────────────
  // Pan the canvas so the given world point is centered in the viewport.
  const handlePanTo = useCallback(
    (worldX, worldY) => {
      const cr = canvasRect || DEFAULT_FALLBACK_CANVAS_RECT;
      const w = cr.width || DEFAULT_FALLBACK_CANVAS_RECT.width;
      const h = cr.height || DEFAULT_FALLBACK_CANVAS_RECT.height;
      setPan({
        x: w / 2 - worldX * (zoom || 1),
        y: h / 2 - worldY * (zoom || 1),
      });
    },
    [setPan, zoom, canvasRect]
  );

  return {
    visible,
    worldBounds,
    visibleWorldRect,
    minimapToWorld,
    worldToMinimap,
    handlePanTo,
    setPan,
    innerWidth,
    innerHeight,
    onSelectElement,
    onMouseEnter,
    onMouseLeave,
  };
}
