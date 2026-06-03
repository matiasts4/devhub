'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  projectId,
  workspaceId,
  dockState,
  onDockStateChange,
  browserWindowState,
  onBrowserWindowStateChange,
  workspaceWindows,
  activeWorkspaceWindowId,
  onWorkspaceWindowSelect,
  onWorkspaceWindowAdd,
  onWorkspaceWindowRemove,
  // New (optional) — for draggable "zonas" / layout dividers between adjacent live surfaces.
  // The parent (PizarraPane) computes them and provides the handler that performs
  // the paired resize when a divider is dragged.
  layoutDividers = [],
  onDividerMouseDown,
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

  // pizarra-multi-select: shared registry of every live surface wrapper +
  // its latest shape/bounds, keyed by shape.id. Group drag reads this map
  // so the dragged item can move ALL selected siblings by the same screen
  // offset without per-item React state or re-renders.
  const surfaceRegistryRef = useRef(new Map());

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
        const zIndex = selected || isActiveTerminal ? 100 : 5;

        return (
          <LiveSurfaceItem
            key={shape.id}
            shape={shape}
            bounds={bounds}
            selected={selected}
            selectedElementIds={selectedElementIds}
            registryRef={surfaceRegistryRef}
            zIndex={zIndex}
            resolvedZoom={resolvedZoom}
            activeTerminalId={activeTerminalId}
            onSelect={onSelect}
            onMoveElementRef={onMoveElementRef}
            onActivateTerminal={onActivateTerminal}
            onUpdateElement={onUpdateElement}
            onRemoveElement={onRemoveElement}
            projectId={projectId}
            workspaceId={workspaceId}
            dockState={dockState}
            onDockStateChange={onDockStateChange}
            browserWindowState={browserWindowState}
            onBrowserWindowStateChange={onBrowserWindowStateChange}
            workspaceWindows={workspaceWindows}
            activeWorkspaceWindowId={activeWorkspaceWindowId}
            onWorkspaceWindowSelect={onWorkspaceWindowSelect}
            onWorkspaceWindowAdd={onWorkspaceWindowAdd}
            onWorkspaceWindowRemove={onWorkspaceWindowRemove}
          />
        );
      })}

      {/* Draggable layout dividers (the "zonas arrastrables" the user wanted).
          Purely presentational here — click/drag is forwarded to the parent
          via onDividerMouseDown. The parent owns the resize math so that the
          two (or more) neighboring windows auto-adjust. */}
      {(layoutDividers || []).map((div) => {
        const isV = div.type === 'v';
        const screenRect = projectRect({
          x: isV ? div.x - 5 : div.x,
          y: isV ? div.y : div.y - 5,
          width: isV ? 10 : div.length,
          height: isV ? div.length : 10,
        });

        const barStyle = isV
          ? {
              left: screenRect.x,
              top: screenRect.y,
              width: 10,
              height: screenRect.height,
              cursor: 'col-resize',
            }
          : {
              left: screenRect.x,
              top: screenRect.y,
              width: screenRect.width,
              height: 10,
              cursor: 'row-resize',
            };

        return (
          <div
            key={div.id}
            data-testid={`pizarra-layout-divider-${div.id}`}
            onMouseDown={(ev) => onDividerMouseDown?.(ev, div)}
            style={{
              position: 'absolute',
              zIndex: 110,
              pointerEvents: 'auto',
              background: 'rgba(88, 166, 255, 0.15)',
              border: '1px solid rgba(88, 166, 255, 0.4)',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 80ms ease',
              ...barStyle,
            }}
          >
            <div
              aria-hidden
              style={{
                background: 'rgba(88, 166, 255, 0.85)',
                borderRadius: 999,
                ...(isV ? { width: 3, height: 18 } : { width: 18, height: 3 }),
              }}
            />
          </div>
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
  selectedElementIds,
  registryRef,
  zIndex,
  resolvedZoom,
  activeTerminalId,
  onSelect,
  onMoveElementRef,
  onActivateTerminal,
  onUpdateElement,
  onRemoveElement,
  projectId,
  workspaceId,
  dockState,
  onDockStateChange,
  browserWindowState,
  onBrowserWindowStateChange,
  workspaceWindows,
  activeWorkspaceWindowId,
  onWorkspaceWindowSelect,
  onWorkspaceWindowAdd,
  onWorkspaceWindowRemove,
}) {
  const shapeRef = useRef(shape);
  useEffect(() => {
    shapeRef.current = shape;
  }, [shape]);

  // pizarra-multi-select: keep the latest selection in a ref so the stable
  // drag callbacks (handleMove/handleDragEnd) can decide group-vs-single
  // without being recreated on every selection change.
  const selectedIdsRef = useRef(selectedElementIds);
  useEffect(() => {
    selectedIdsRef.current = selectedElementIds;
  }, [selectedElementIds]);

  // pizarra-multi-select: shift state captured on mousedown (capture phase)
  // so the single-arg onSelect(id) call from the surface can be upgraded to
  // onSelect(id, multi) without changing the surface component contract.
  const modifierRef = useRef(false);

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
  // pizarra-multi-select: when a group drag is active, holds a Map of
  // siblingId -> { x, y } drag-start screen positions. null = single drag.
  const groupDragStartRef = useRef(null);

  // pizarra-multi-select: keep the shared registry entry fresh after every
  // commit so group drag reads the latest wrapper element, shape, and
  // projected bounds. Unregister on unmount only.
  useLayoutEffect(() => {
    registryRef.current.set(shape.id, {
      el: wrapperRef.current,
      shape,
      bounds,
    });
  });
  useEffect(() => {
    const registry = registryRef.current;
    const id = shape.id;
    return () => {
      registry.delete(id);
    };
  }, [registryRef, shape.id]);

  const handleMove = useCallback(
    ({ deltaX = 0, deltaY = 0 }) => {
      const zoom = resolvedZoomRef.current || 1;
      // Capture drag-start position + group membership on the first tick only.
      if (!dragStartBoundsRef.current) {
        dragStartBoundsRef.current = { x: boundsRef.current.x, y: boundsRef.current.y };
        const selectedIds = selectedIdsRef.current || [];
        const isGroupDrag = selectedIds.length > 1 && selectedIds.includes(shapeRef.current.id);
        if (isGroupDrag) {
          const starts = new Map();
          for (const sid of selectedIds) {
            const entry = registryRef.current.get(sid);
            if (entry && entry.el) {
              starts.set(sid, { x: entry.bounds.x, y: entry.bounds.y });
            }
          }
          groupDragStartRef.current = starts;
        } else {
          groupDragStartRef.current = null;
        }
      }
      dragScreenOffsetRef.current.x += deltaX * zoom;
      dragScreenOffsetRef.current.y += deltaY * zoom;
      const offsetX = dragScreenOffsetRef.current.x;
      const offsetY = dragScreenOffsetRef.current.y;

      const group = groupDragStartRef.current;
      if (group) {
        // Move EVERY selected sibling (including self) by the same screen offset.
        for (const [sid, start] of group) {
          const entry = registryRef.current.get(sid);
          if (entry && entry.el) {
            entry.el.style.left = start.x + offsetX + 'px';
            entry.el.style.top = start.y + offsetY + 'px';
          }
        }
      } else if (wrapperRef.current) {
        const start = dragStartBoundsRef.current;
        wrapperRef.current.style.left = start.x + offsetX + 'px';
        wrapperRef.current.style.top = start.y + offsetY + 'px';
      }
    },
    [registryRef]
  );

  const handleDragEnd = useCallback(
    ({ totalDeltaX = 0, totalDeltaY = 0 }) => {
      dragStartBoundsRef.current = null;
      const group = groupDragStartRef.current;
      groupDragStartRef.current = null;
      if (group) {
        // Commit each selected sibling's new position once (canvas units).
        for (const sid of group.keys()) {
          const entry = registryRef.current.get(sid);
          const siblingShape = entry?.shape;
          if (siblingShape) {
            onMoveElementRef.current?.(sid, {
              x: siblingShape.x + totalDeltaX,
              y: siblingShape.y + totalDeltaY,
            });
          }
        }
        return;
      }
      const s = shapeRef.current;
      onMoveElementRef.current?.(s.id, {
        x: s.x + totalDeltaX,
        y: s.y + totalDeltaY,
      });
    },
    [onMoveElementRef, registryRef]
  );

  // pizarra-multi-select: upgrade the surface's single-arg onSelect(id) into
  // onSelect(id, multi). The shift flag is read from modifierRef (set in the
  // wrapper's onMouseDownCapture). If the surface is already part of a
  // multi-selection and no modifier is held, we PRESERVE the group so a
  // plain drag moves all selected surfaces instead of collapsing to one.
  const handleSelectWithModifier = useCallback(
    (id) => {
      const shift = modifierRef.current;
      if (!shift) {
        const ids = selectedIdsRef.current || [];
        if (ids.length > 1 && ids.includes(id)) {
          return;
        }
      }
      onSelect?.(id, shift);
    },
    [onSelect]
  );

  // On drop, React re-renders the wrapper with new bounds (left/top from
  // the reducer). The direct DOM style is overridden by React's commit.
  // We only need to reset the offset tracking so the next drag starts clean.
  useLayoutEffect(() => {
    dragScreenOffsetRef.current = { x: 0, y: 0 };
  }, [shape.x, shape.y]);

  // pizarra-drag-fluidity: wrapper is sized/positioned to the element
  // (not inset:0). Two inset:0 divs stacked on the full canvas created
  // overlapping hit areas that made both elements interfere during drag.
  // Children receive localBounds with x=0,y=0 so the wrapper owns the
  // absolute positioning; screenX/Y are preserved for VTE sync.
  const localBounds = useMemo(
    () => ({
      x: 0,
      y: 0,
      width: bounds.width,
      height: bounds.height,
      screenX: bounds.screenX,
      screenY: bounds.screenY,
    }),
    [bounds.width, bounds.height, bounds.screenX, bounds.screenY]
  );

  if (shape.type === SHAPE_TYPES.TERMINAL) {
    return (
      <div
        ref={wrapperRef}
        onMouseDownCapture={(e) => {
          modifierRef.current = e.shiftKey;
        }}
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
          terminalId={shape.panelId || shape.id}
          shape={shape}
          bounds={localBounds}
          selected={selected}
          zoom={resolvedZoom}
          onSelect={handleSelectWithModifier}
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
      onMouseDownCapture={(e) => {
        modifierRef.current = e.shiftKey;
      }}
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
        zoom={resolvedZoom}
        onSelect={handleSelectWithModifier}
        onMove={handleMove}
        onDragEnd={handleDragEnd}
        onUpdateElement={onUpdateElement}
        onClose={() => onRemoveElement?.(shape.id)}
        projectId={projectId}
        workspaceId={workspaceId}
        dockState={dockState}
        onDockStateChange={onDockStateChange}
        browserWindowState={browserWindowState}
        onBrowserWindowStateChange={onBrowserWindowStateChange}
        workspaceWindows={workspaceWindows}
        activeWorkspaceWindowId={activeWorkspaceWindowId}
        onWorkspaceWindowSelect={onWorkspaceWindowSelect}
        onWorkspaceWindowAdd={onWorkspaceWindowAdd}
        onWorkspaceWindowRemove={onWorkspaceWindowRemove}
      />
    </div>
  );
}
