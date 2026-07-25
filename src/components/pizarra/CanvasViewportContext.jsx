'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { canvasToViewport, viewportToCanvas } from '@/lib/pizarra/canvasViewport';

const CanvasViewportContext = createContext(null);

const DEFAULT_PAN = { x: 0, y: 0 };
const DEFAULT_ZOOM = 1;

export { DEFAULT_PAN, DEFAULT_ZOOM };

/**
 * CanvasViewportProvider — wraps the pizarra canvas.
 * Uses a ResizeObserver on the canvas container to keep canvasRect in sync.
 * Exports: zoom, setZoom, pan, setPan, canvasRect, canvasToViewport, viewportToCanvas
 */
export function CanvasViewportProvider({
  children,
  canvasContainerRef,
  initialZoom = DEFAULT_ZOOM,
}) {
  const [zoom, setZoom] = useState(initialZoom);
  const [pan, setPan] = useState(DEFAULT_PAN);
  const [canvasRect, setCanvasRect] = useState(null);

  useEffect(() => {
    const container = canvasContainerRef?.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasRect(entry.target.getBoundingClientRect());
      }
    });
    observer.observe(container);
    setCanvasRect(container.getBoundingClientRect());

    return () => observer.disconnect();
  }, [canvasContainerRef]);

  const opts = useCallback(() => ({ zoom, pan, canvasRect }), [zoom, pan, canvasRect]);

  const value = {
    zoom,
    setZoom,
    pan,
    setPan,
    canvasRect,
    canvasToViewport: (cx, cy) => canvasToViewport(cx, cy, opts()),
    viewportToCanvas: (vx, vy) => viewportToCanvas(vx, vy, opts()),
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
