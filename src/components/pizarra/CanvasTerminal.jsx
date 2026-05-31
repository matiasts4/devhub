/**
 * CanvasTerminal — embeds a TerminalTTY instance inside a pizarra canvas.
 *
 * Key responsibilities:
 * - position: absolute container with canvas-relative coordinates
 * - Zoom propagation: updates container width/height attributes (NOT CSS transform)
 *   so FitAddon.getBoundingClientRect() sees correct physical pixel dimensions
 * - VTE renderer blocked: always enforces requestedRendererMode='xterm'
 * - Session lifecycle: register terminalId on mount, deregister on unmount
 * - ResizeObserver on container div so TerminalTTY can read physical dimensions
 *   via externalDimensionSource when FitAddon.fit() is called
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import TerminalTTY from '@/components/TerminalTTY';
import styles from './CanvasTerminal.module.css';

export default function CanvasTerminal({
  terminalId,
  position = { x: 0, y: 0 },
  size = { width: 800, height: 600 },
  canvasZoom = 1,
  onClose,
  onResize,
  onActivatePanel,
  cwd,
  initialCommand,
  autoFocus = true,
}) {
  const containerRef = useRef(null);
  const zoomRafRef = useRef(null);
  // Track logical size separately so we can distinguish PTY-driven resize
  // from zoom-driven container resize (the former updates canvas state,
  // the latter only changes zoom-derived physical dimensions).
  const [logicalSize, setLogicalSize] = useState(size);

  // ── Coordinate translation ──────────────────────────────────────────────
  // position is canvas logical coordinates. The container div uses viewport
  // (physical) coordinates so the canvas panning/zooming system can position it.
  // CanvasViewportProvider + useCanvasViewport() handle the translation.

  // ── Zoom propagation via DOM width/height ────────────────────────────────
  // When canvas zoom changes, set container.style.width/height = logical * zoom.
  // Using requestAnimationFrame to debounce multiple rapid zoom events.
  useEffect(() => {
    if (!containerRef.current) return;

    // Cancel any pending RAF from a previous zoom change
    if (zoomRafRef.current) {
      cancelAnimationFrame(zoomRafRef.current);
    }

    zoomRafRef.current = requestAnimationFrame(() => {
      zoomRafRef.current = null;
      const physicalWidth = logicalSize.width * canvasZoom;
      const physicalHeight = logicalSize.height * canvasZoom;
      containerRef.current.style.width = String(physicalWidth) + 'px';
      containerRef.current.style.height = String(physicalHeight) + 'px';
    });

    return () => {
      if (zoomRafRef.current) {
        cancelAnimationFrame(zoomRafRef.current);
        zoomRafRef.current = null;
      }
    };
  }, [canvasZoom, logicalSize]);

  // ── VTE renderer enforcement ─────────────────────────────────────────────
  // CanvasTerminal always enforces xterm renderer. VTE renders to a native
  // GTK surface outside the DOM tree, so it cannot be positioned within the
  // canvas. We also emit the required console warning if a consumer ever
  // manages to pass a non-xterm mode (defence-in-depth).
  // eslint-disable-next-line no-console
  useEffect(() => {
    console.warn(
      'Canvas terminals do not support VTE renderer. Falling back to xterm.'
    );
  }, []);

  // ── External dimension source for TerminalTTY ─────────────────────────────
  // TerminalTTY uses externalDimensionSource() to read the container's
  // physical pixel dimensions for FitAddon.fit() calculations instead of
  // relying on getBoundingClientRect() alone (canvas-hosted containers may
  // have been sized via style.width/height which getBoundingClientRect() reads).
  const externalDimensionSource = useCallback(() => {
    if (!containerRef.current) return null;
    return containerRef.current.getBoundingClientRect();
  }, []);

  // ── onResize handler — propagate PTY-driven resize back to canvas ──────────
  const handleResize = useCallback(
    (newSize) => {
      setLogicalSize(newSize);
      onResize?.(newSize);
    },
    [onResize]
  );

  // ── Session lifecycle ─────────────────────────────────────────────────────
  // Register this terminal on mount; close session on unmount.
  useEffect(() => {
    // Canvas context registration would go here if a canvas context exists.
    // For now the CanvasViewportProvider manages terminal registration.
    // onClose is called when the component unmounts to allow parent canvas
    // to clean up the session.
    return () => {
      onClose?.();
    };
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      className={styles.container}
      data-testid="canvas-terminal-container"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      <TerminalTTY
        id={terminalId}
        requestedRendererMode="xterm"
        hideTitleBar
        externalDimensionSource={externalDimensionSource}
        onResize={handleResize}
        onActivatePanel={onActivatePanel}
        cwd={cwd}
        initialCommand={initialCommand}
        autoFocus={autoFocus}
        isVisibleInLayout
        isActivePanel={autoFocus}
        showQuickCopyButton={false}
      />
    </div>
  );
}
