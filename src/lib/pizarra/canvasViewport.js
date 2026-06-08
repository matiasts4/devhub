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
}) {
  const [zoom, setZoom] = useState(initialZoom);
  const [pan, setPan] = useState(DEFAULT_PAN);
  const [canvasRect, setCanvasRect] = useState(null);

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
      // Check if the wheel event occurred inside scrollable interactive widgets (e.g., TerminalTTY viewport or browser frame)
      const isInsideInteractive = event.target.closest(
        '[data-testid="pizarra-browser-surface"], [data-testid="canvas-terminal"]'
      );

      // Intercept and handle zoom if it is a trackpad pinch zoom (ctrlKey is true) OR if it is outside interactive cards.
      if (event.ctrlKey || !isInsideInteractive) {
        event.preventDefault();
        setZoom((currentZoom) => Math.min(Math.max(currentZoom - event.deltaY * 0.001, 0.1), 5));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [canvasContainerRef, setZoom]);

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
