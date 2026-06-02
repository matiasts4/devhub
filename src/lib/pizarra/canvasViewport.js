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

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const CanvasViewportContext = createContext(null);

const DEFAULT_PAN = { x: 0, y: 0 };
const DEFAULT_ZOOM = 1;

/**
 * CanvasViewportProvider — wrap the pizarra root.
 * Attaches a ResizeObserver to the canvas container element to keep
 * canvasRect up to date as the canvas moves within the viewport.
 */
export function CanvasViewportProvider({ children, canvasContainerRef, initialZoom = DEFAULT_ZOOM }) {
  const [zoom, setZoom] = useState(initialZoom);
  const [pan, setPan] = useState(DEFAULT_PAN);
  const [canvasRect, setCanvasRect] = useState(null);
  const measureCanvasRect = useCallback(() => {
    const container = canvasContainerRef?.current;
    if (!container?.getBoundingClientRect) return;
    setCanvasRect(container.getBoundingClientRect());
  }, [canvasContainerRef]);

  // Track canvas element viewport position via ResizeObserver
  useEffect(() => {
    const container = canvasContainerRef?.current;
    if (!container) return;

    // The canvas container is the scrollable/panable wrapper.
    // We observe it to detect layout changes (scroll, pan, window resize).
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const rect = entry.target.getBoundingClientRect();
        setCanvasRect(rect);
      }
    });
    observer.observe(container);

    // Set initial value
    measureCanvasRect();

    window.addEventListener('resize', measureCanvasRect);
    window.addEventListener('scroll', measureCanvasRect, true);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measureCanvasRect);
      window.removeEventListener('scroll', measureCanvasRect, true);
    };
  }, [canvasContainerRef, measureCanvasRect]);

  // Intercept all wheel events at the canvasContainer boundary to handle custom zoom/pinch gestures
  // while preventing default browser-wide native zoom and letting interactive panels scroll.
  useEffect(() => {
    const container = canvasContainerRef?.current;
    if (!container) return;

    const handleWheel = (event) => {
      // Check if the wheel event occurred inside scrollable interactive widgets (e.g., TerminalTTY viewport or browser frame)
      const isInsideInteractive = event.target.closest('[data-testid="pizarra-browser-surface"], [data-testid="canvas-terminal"]');

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

  return (
    <CanvasViewportContext.Provider value={value}>
      {children}
    </CanvasViewportContext.Provider>
  );
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
