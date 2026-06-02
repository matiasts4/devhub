'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import CanvasTerminal from './CanvasTerminal';
import PizarraBrowserSurface from './PizarraBrowserSurface';
import { useCanvasViewport } from '@/lib/pizarra/canvasViewport';
import { SHAPE_TYPES } from '@/lib/pizarra/shapeModel';

export default function PizarraLiveSurfaceLayer({
  elements,
  selectedElementIds,
  activeTerminalId = null,
  onSelect,
  onMoveElement,
  onActivateTerminal,
  onUpdateElement,
  onRemoveElement,
}) {
  const { projectRect, zoom } = useCanvasViewport();

  // pizarra-drag-desync-v2: mirror the latest onMoveElement into a
  // ref so the stable `handleMove` inside each LiveSurfaceItem can
  // always dispatch to the freshest callback without forcing the
  // useCallback identity to change on every parent render. This
  // matches the onClose ref pattern introduced by
  // pizarra-add-terminal-bugfix.
  const onMoveElementRef = useRef(onMoveElement);
  useEffect(() => {
    onMoveElementRef.current = onMoveElement;
  }, [onMoveElement]);

  const surfaceShapes = elements.filter(
    (shape) => shape.type === SHAPE_TYPES.TERMINAL || shape.type === SHAPE_TYPES.BROWSER
  );

  if (surfaceShapes.length === 0) {
    return null;
  }

  const resolvedZoom = zoom > 0 ? zoom : 1;

  return (
    <div
      data-testid="pizarra-live-surface-layer"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        // No fixed zIndex here — each item manages its own via zIndex prop
      }}
    >
      {surfaceShapes.map((shape) => {
        const bounds = projectRect({
          x: shape.x,
          y: shape.y,
          width: shape.width,
          height: shape.height,
        });
        const selected = selectedElementIds.includes(shape.id);
        const isActiveTerminal = shape.id === activeTerminalId;
        // Selected or active terminal always floats above everything else.
        // Non-selected items get zIndex based on insertion order (index in array).
        const zIndex = selected || isActiveTerminal ? 100 : 5;

        return (
          <LiveSurfaceItem
            key={shape.id}
            shape={shape}
            bounds={bounds}
            selected={selected}
            zIndex={zIndex}
            resolvedZoom={resolvedZoom}
            activeTerminalId={activeTerminalId}
            onSelect={onSelect}
            onMoveElementRef={onMoveElementRef}
            onActivateTerminal={onActivateTerminal}
            onUpdateElement={onUpdateElement}
            onRemoveElement={onRemoveElement}
          />
        );
      })}
    </div>
  );
}

// pizarra-drag-fluidity: each surface item owns its own drag wrapper ref
// and applies CSS transform DIRECTLY to the DOM during drag — no React
// re-renders per mousemove. The reducer is only called ONCE on mouseup
// via onDragEnd. This eliminates the stale-closure desync AND the
// per-tick React render storm that caused visible jitter.
function LiveSurfaceItem({
  shape,
  bounds,
  selected,
  zIndex,
  resolvedZoom,
  activeTerminalId,
  onSelect,
  onMoveElementRef,
  onActivateTerminal,
  onUpdateElement,
  onRemoveElement,
}) {
  const shapeRef = useRef(shape);
  useEffect(() => {
    shapeRef.current = shape;
  }, [shape]);

  // resolvedZoom ref so the drag callbacks read the latest zoom
  // without being recreated on zoom change.
  const resolvedZoomRef = useRef(resolvedZoom);
  useEffect(() => {
    resolvedZoomRef.current = resolvedZoom;
  }, [resolvedZoom]);

  // pizarra-drag-fluidity: wrapper moves by direct left/top DOM mutation.
  // CSS transform was discarded because it leaves a layout ghost at the
  // original position — especially visible with native VTE overlays that
  // are positioned via IPC and don't respond to CSS transforms at all.
  // Direct left/top mutation physically relocates the wrapper each tick:
  // zero React renders, no ghost, no transform layer.
  const wrapperRef = useRef(null);
  const dragScreenOffsetRef = useRef({ x: 0, y: 0 });

  // Stable ref to the latest bounds — used ONLY to capture drag-start
  // position on the first handleMove tick. boundsRef is NOT read
  // repeatedly during drag so zoom/pan changes mid-drag don't corrupt
  // the accumulated offset.
  const boundsRef = useRef(bounds);
  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);
  // Captured once at drag start (first move tick); cleared on drag end.
  const dragStartBoundsRef = useRef(null);

  const handleMove = useCallback(({ deltaX = 0, deltaY = 0 }) => {
    // Capture drag-start position on the first tick only.
    if (!dragStartBoundsRef.current) {
      dragStartBoundsRef.current = { x: boundsRef.current.x, y: boundsRef.current.y };
    }
    const zoom = resolvedZoomRef.current || 1;
    dragScreenOffsetRef.current.x += deltaX * zoom;
    dragScreenOffsetRef.current.y += deltaY * zoom;
    if (wrapperRef.current) {
      const start = dragStartBoundsRef.current;
      wrapperRef.current.style.left = (start.x + dragScreenOffsetRef.current.x) + 'px';
      wrapperRef.current.style.top  = (start.y + dragScreenOffsetRef.current.y) + 'px';
    }
  }, []);

  const handleDragEnd = useCallback(({ totalDeltaX = 0, totalDeltaY = 0 }) => {
    dragStartBoundsRef.current = null;
    const s = shapeRef.current;
    onMoveElementRef.current?.(s.id, {
      x: s.x + totalDeltaX,
      y: s.y + totalDeltaY,
    });
  }, [onMoveElementRef]);

  // On drop, React re-renders the wrapper with new bounds (left/top from
  // the reducer). The direct DOM style is overridden by React's commit.
  // We only need to reset the offset tracking so the next drag starts clean.
  useLayoutEffect(() => {
    dragScreenOffsetRef.current = { x: 0, y: 0 };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape.x, shape.y]);


  // pizarra-drag-fluidity: wrapper is sized/positioned to the element
  // (not inset:0). Two inset:0 divs stacked on the full canvas created
  // overlapping hit areas that made both elements interfere during drag.
  // Children receive localBounds with x=0,y=0 so the wrapper owns the
  // absolute positioning; screenX/Y are preserved for VTE sync.
  const localBounds = useMemo(() => ({
    x: 0,
    y: 0,
    width: bounds.width,
    height: bounds.height,
    screenX: bounds.screenX,
    screenY: bounds.screenY,
  }), [bounds.width, bounds.height, bounds.screenX, bounds.screenY]);

  if (shape.type === SHAPE_TYPES.TERMINAL) {
    return (
      <div
        ref={wrapperRef}
        style={{
          position: 'absolute',
          left: bounds.x,
          top: bounds.y,
          width: bounds.width,
          height: bounds.height,
          pointerEvents: 'none',
          zIndex,
        }}
      >
        <CanvasTerminal
          terminalId={shape.id}
          shape={shape}
          bounds={localBounds}
          selected={selected}
          onSelect={onSelect}
          onMove={handleMove}
          onDragEnd={handleDragEnd}
          onResize={(newBounds) => onUpdateElement?.(shape.id, newBounds)}
          onActivatePanel={() => onActivateTerminal?.(shape.id)}
          cwd={shape.cwd}
          initialCommand={shape.initialCommand}
          isActivePanel={activeTerminalId === shape.id}
          requestedRendererMode={shape.requestedRendererMode || 'vte-experimental'}
          onClose={() => onRemoveElement?.(shape.id)}
        />
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'absolute',
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
        pointerEvents: 'none',
        zIndex,
      }}
    >
      <PizarraBrowserSurface
        shape={shape}
        bounds={localBounds}
        selected={selected}
        onSelect={onSelect}
        onMove={handleMove}
        onDragEnd={handleDragEnd}
        onUpdateElement={onUpdateElement}
        onClose={() => onRemoveElement?.(shape.id)}
      />
    </div>
  );
}
