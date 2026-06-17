/**
 * CanvasViewportContext — shared zoom/pan/coordinate-translation state
 * for all canvas children (terminals, agent nodes, textboxes).
 *
 * The critical constraint: FitAddon.getBoundingClientRect() returns
 * physical pixels, NOT CSS-transformed pixels. When the canvas zooms,
 * zoom is propagated by updating container DOM width/height attributes,
 * not by applying CSS transform: scale().
 */

/**
 * Translate canvas logical coordinates to viewport absolute coordinates.
 *
 * Formula:
 *   viewportX = canvasRect.left + panOffset.x + (canvasLogicalX * zoom)
 *   viewportY = canvasRect.top  + panOffset.y + (canvasLogicalY * zoom)
 *
 * @param {number} canvasX
 * @param {number} canvasY
 * @param {{ zoom: number, pan: { x: number, y: number }, canvasRect: DOMRect }} opts
 * @returns {{ x: number, y: number }}
 */
export function canvasToViewport(canvasX, canvasY, { zoom, pan, canvasRect } = {}) {
  const z = zoom != null && zoom > 0 ? zoom : 1;
  const panX = pan?.x ?? 0;
  const panY = pan?.y ?? 0;
  const left = canvasRect?.left ?? 0;
  const top = canvasRect?.top ?? 0;
  return {
    x: left + panX + canvasX * z,
    y: top + panY + canvasY * z,
  };
}

/**
 * Translate viewport absolute coordinates to canvas logical coordinates.
 *
 * Formula:
 *   canvasLogicalX = (viewportX - canvasRect.left - panOffset.x) / zoom
 *   canvasLogicalY = (viewportY - canvasRect.top  - panOffset.y) / zoom
 *
 * @param {number} viewportX
 * @param {number} viewportY
 * @param {{ zoom: number, pan: { x: number, y: number }, canvasRect: DOMRect }} opts
 * @returns {{ x: number, y: number }}
 */
export function viewportToCanvas(viewportX, viewportY, { zoom, pan, canvasRect } = {}) {
  const z = zoom ?? 1;
  if (z === 0) return { x: 0, y: 0 };
  const panX = pan?.x ?? 0;
  const panY = pan?.y ?? 0;
  const left = canvasRect?.left ?? 0;
  const top = canvasRect?.top ?? 0;
  return {
    x: (viewportX - left - panX) / z,
    y: (viewportY - top - panY) / z,
  };
}

/**
 * Project a logical canvas rect into overlay-local coordinates and absolute screen bounds.
 *
 * Overlay-local coordinates are relative to the positioned pizarra canvas container.
 * Absolute bounds additionally include canvasRect left/top for native surface bridges.
 *
 * @param {{ x?: number, y?: number, width?: number, height?: number }} rect
 * @param {{ zoom: number, pan: { x: number, y: number }, canvasRect: DOMRect }} opts
 * @returns {{ x: number, y: number, width: number, height: number, screenX: number, screenY: number }}
 */
export function projectCanvasRect(rect = {}, { zoom, pan, canvasRect } = {}) {
  const z = zoom != null && zoom > 0 ? zoom : 1;
  const panX = pan?.x ?? 0;
  const panY = pan?.y ?? 0;
  const x = panX + (rect.x ?? 0) * z;
  const y = panY + (rect.y ?? 0) * z;
  const width = Math.max(0, (rect.width ?? 0) * z);
  const height = Math.max(0, (rect.height ?? 0) * z);
  const left = canvasRect?.left ?? 0;
  const top = canvasRect?.top ?? 0;

  return {
    x,
    y,
    width,
    height,
    screenX: left + x,
    screenY: top + y,
  };
}

export const MIN_CANVAS_ZOOM = 0.1;
export const MAX_CANVAS_ZOOM = 5;
export const ZOOM_WHEEL_SCALE = 0.001;

/**
 * Zoom toward a container-local focal point while keeping that canvas
 * coordinate pinned under the cursor (or viewport center for buttons).
 */
export function zoomAtPoint({
  currentZoom = 1,
  currentPan = { x: 0, y: 0 },
  deltaY = 0,
  focalX = 0,
  focalY = 0,
  minZoom = MIN_CANVAS_ZOOM,
  maxZoom = MAX_CANVAS_ZOOM,
} = {}) {
  const z = currentZoom > 0 ? currentZoom : 1;
  const panX = currentPan?.x ?? 0;
  const panY = currentPan?.y ?? 0;
  const nextZoom = Math.min(maxZoom, Math.max(minZoom, z - deltaY * ZOOM_WHEEL_SCALE));

  if (nextZoom === z) {
    return { zoom: z, pan: { x: panX, y: panY } };
  }

  const canvasX = (focalX - panX) / z;
  const canvasY = (focalY - panY) / z;

  return {
    zoom: nextZoom,
    pan: {
      x: focalX - canvasX * nextZoom,
      y: focalY - canvasY * nextZoom,
    },
  };
}

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { shouldCanvasConsumeWheel } from './pizarraWheel';
import { normalizeWheelDelta } from './pizarraViewLayout';

const CanvasViewportContext = createContext(null);

const DEFAULT_PAN = { x: 0, y: 0 };
const DEFAULT_ZOOM = 1;

/**
 * CanvasViewportProvider — wrap the pizarra root.
 * Attaches a ResizeObserver to the canvas container element to keep
 * canvasRect up to date as the canvas moves within the viewport.
 */
export function CanvasViewportProvider({
  children,
  canvasContainerRef,
  initialZoom = DEFAULT_ZOOM,
  initialPan = DEFAULT_PAN,
}) {
  const [zoom, setZoom] = useState(initialZoom);
  const [pan, setPan] = useState(initialPan);
  const [canvasRect, setCanvasRect] = useState(null);
  const wheelViewNavigateRef = useRef(null);

  // pizarra-motion: coalesce canvasRect updates. Previously every scroll
  // pixel / ResizeObserver tick called setCanvasRect, which re-projected
  // EVERY surface and made unrelated cards visibly jump/desync. We now:
  //  (1) batch all triggers within a frame into a single measure (rAF), and
  //  (2) skip the state commit when the rect is structurally unchanged.
  const rafIdRef = useRef(null);
  const lastRectRef = useRef(null);

  const commitRectIfChanged = useCallback((rect) => {
    if (!rect) return;
    const prev = lastRectRef.current;
    if (
      prev &&
      prev.left === rect.left &&
      prev.top === rect.top &&
      prev.width === rect.width &&
      prev.height === rect.height
    ) {
      return; // structurally identical — no reproject storm.
    }
    lastRectRef.current = rect;
    setCanvasRect(rect);
  }, []);

  const scheduleMeasure = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (rafIdRef.current != null) return; // already scheduled this frame
    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null;
      const container = canvasContainerRef?.current;
      if (!container?.getBoundingClientRect) return;
      commitRectIfChanged(container.getBoundingClientRect());
    });
  }, [canvasContainerRef, commitRectIfChanged]);

  // measureCanvasRect — public imperative API. Coalesced like the rest.
  const measureCanvasRect = useCallback(() => {
    scheduleMeasure();
  }, [scheduleMeasure]);

  // Track canvas element viewport position via ResizeObserver
  useEffect(() => {
    const container = canvasContainerRef?.current;
    if (!container) return;

    // The canvas container is the scrollable/panable wrapper.
    // We observe it to detect layout changes (scroll, pan, window resize).
    const observer = new ResizeObserver(() => {
      scheduleMeasure();
    });
    observer.observe(container);

    // Set initial value
    scheduleMeasure();

    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, true);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, true);
      if (rafIdRef.current != null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [canvasContainerRef, scheduleMeasure]);

  // Intercept all wheel events at the canvasContainer boundary to handle custom zoom/pinch gestures
  // while preventing default browser-wide native zoom and letting interactive panels scroll.
  useEffect(() => {
    const container = canvasContainerRef?.current;
    if (!container) return;

    const handleWheel = (event) => {
      const dx = normalizeWheelDelta(event.deltaX, event.deltaMode);
      const dy = normalizeWheelDelta(event.deltaY, event.deltaMode);

      // 2-finger horizontal swipe → switch workspace window (V1↔V2).
      // Runs before shouldCanvasConsumeWheel so it works over terminals/browsers too.
      if (
        !event.ctrlKey &&
        !event.metaKey &&
        typeof wheelViewNavigateRef.current === 'function' &&
        wheelViewNavigateRef.current(dx, dy)
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      // pizarra-motion-polish (P-MP-5): route through the shared
      // helper so the provider's selector set cannot drift from
      // PizarraCanvas.jsx's. The helper returns false when the
      // wheel is over a terminal/browser surface (xterm viewport
      // scrolls) or when the event target matches the interactive
      // wheel selector. Trackpad pinch zoom (ctrlKey) is honored
      // by treating it as a zoom regardless of target.
      //
      // For focal zoom math we use the same `zoomAtPoint` helper
      // the PizarraCanvas wheel handler uses (P-MP-4). The focal
      // point is `event.clientX/Y - containerRect.left/top`. On
      // containers that don't expose a real rect (test envs), the
      // zoomAtPoint default focal (0,0) is the safe fallback —
      // still produces a valid zoom clamp.
      if (event.ctrlKey || shouldCanvasConsumeWheel(event)) {
        event.preventDefault();

        // pizarra-fluidity: pinch / ctrl / ⌘ + wheel → focal ZOOM. A plain
        // wheel / two-finger trackpad gesture → PAN (navigate the board). This
        // mirrors the PizarraCanvas wrapper handler so the routing can't drift.
        if (event.ctrlKey || event.metaKey) {
          const rect = container.getBoundingClientRect
            ? container.getBoundingClientRect()
            : { left: 0, top: 0 };
          const next = zoomAtPoint({
            currentZoom: zoom,
            currentPan: pan,
            deltaY: event.deltaY,
            focalX: event.clientX - rect.left,
            focalY: event.clientY - rect.top,
          });
          setZoom(next.zoom);
          setPan(next.pan);
          return;
        }

        const panDx = normalizeWheelDelta(event.deltaX, event.deltaMode);
        const panDy = normalizeWheelDelta(event.deltaY, event.deltaMode);
        setPan((current) => ({
          x: (current?.x ?? 0) - panDx,
          y: (current?.y ?? 0) - panDy,
        }));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [canvasContainerRef, setZoom, setPan, zoom, pan]);

  const value = {
    zoom,
    setZoom,
    pan,
    setPan,
    canvasRect,
    canvasToViewport: useCallback(
      (cx, cy) => canvasToViewport(cx, cy, { zoom, pan, canvasRect }),
      [zoom, pan, canvasRect]
    ),
    viewportToCanvas: useCallback(
      (vx, vy) => viewportToCanvas(vx, vy, { zoom, pan, canvasRect }),
      [zoom, pan, canvasRect]
    ),
    projectRect: useCallback(
      (rect) => projectCanvasRect(rect, { zoom, pan, canvasRect }),
      [zoom, pan, canvasRect]
    ),
    measureCanvasRect,
    setWheelViewNavigateHandler: (handler) => {
      wheelViewNavigateRef.current = typeof handler === 'function' ? handler : null;
    },
  };

  return <CanvasViewportContext.Provider value={value}>{children}</CanvasViewportContext.Provider>;
}

/**
 * useCanvasViewport — access zoom, pan, canvasRect, and coordinate translators.
 */
export function useCanvasViewport() {
  const ctx = useContext(CanvasViewportContext);
  if (!ctx) {
    throw new Error('useCanvasViewport must be used within CanvasViewportProvider');
  }
  return ctx;
}
