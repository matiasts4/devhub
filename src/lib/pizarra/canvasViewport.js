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
    setCanvasRect(container.getBoundingClientRect());

    return () => observer.disconnect();
  }, [canvasContainerRef]);

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
