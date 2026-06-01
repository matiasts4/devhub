'use client';

import { useCallback, useEffect, useRef } from 'react';
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
        zIndex: 5,
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

        return (
          <LiveSurfaceItem
            key={shape.id}
            shape={shape}
            bounds={bounds}
            selected={selected}
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

// pizarra-drag-desync-v2: each surface item owns its own ref and
// handleMove so the React Rules of Hooks are not violated by
// calling useRef/useEffect/useCallback inside a parent's .map(). The
// item is keyed by shape.id so it persists across parent renders
// and the per-item state survives the parent re-render that
// triggered the stale-closure bug.
function LiveSurfaceItem({
  shape,
  bounds,
  selected,
  resolvedZoom,
  activeTerminalId,
  onSelect,
  onMoveElementRef,
  onActivateTerminal,
  onUpdateElement,
  onRemoveElement,
}) {
  // Mirror the latest shape into a ref so handleMove always reads
  // the freshest shape data. The parent re-renders whenever the
  // reducer updates elements[].x/y, so the ref is updated on every
  // render to track the latest shape.
  const shapeRef = useRef(shape);
  useEffect(() => {
    shapeRef.current = shape;
  }, [shape]);

  // Stable handleMove: the same function reference across renders.
  // The drag hook (usePizarraSurfaceDrag) wires onMove at mousedown
  // and never refreshes that reference for the duration of a single
  // drag. With a stable reference, the drag hook keeps calling the
  // SAME function, which reads the freshest shape via ref.
  const handleMove = useCallback(
    ({ totalDeltaX = 0, totalDeltaY = 0 }) => {
      const s = shapeRef.current;
      onMoveElementRef.current?.(s.id, {
        x: s.x + totalDeltaX / resolvedZoom,
        y: s.y + totalDeltaY / resolvedZoom,
      });
    },
    [resolvedZoom, onMoveElementRef]
  );

  if (shape.type === SHAPE_TYPES.TERMINAL) {
    return (
      <CanvasTerminal
        terminalId={shape.id}
        shape={shape}
        bounds={bounds}
        selected={selected}
        onSelect={onSelect}
        onMove={handleMove}
        onActivatePanel={() => onActivateTerminal?.(shape.id)}
        cwd={shape.cwd}
        initialCommand={shape.initialCommand}
        isActivePanel={activeTerminalId === shape.id}
        requestedRendererMode={shape.requestedRendererMode || 'vte-experimental'}
        onClose={() => onRemoveElement?.(shape.id)}
      />
    );
  }

  return (
    <PizarraBrowserSurface
      shape={shape}
      bounds={bounds}
      selected={selected}
      onSelect={onSelect}
      onMove={handleMove}
      onUpdateElement={onUpdateElement}
      onClose={() => onRemoveElement?.(shape.id)}
    />
  );
}
