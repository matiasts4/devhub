'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import CanvasTerminal from './CanvasTerminal';
import PizarraBrowserSurface from './PizarraBrowserSurface';
import { useCanvasViewport } from '@/lib/pizarra/canvasViewport';
import { SHAPE_TYPES } from '@/lib/pizarra/shapeModel';
import { getSurfaceViewId } from '@/lib/pizarra/pizarraViewLayout';
import {
  scheduleNativeBrowserResize,
  flushNativeBrowserResize,
  setNativeBrowserVisibility,
} from '@/lib/browser/nativeBrowserBridge';

export function resolvePizarraOwnsLiveSurfaces(dockState) {
  return Boolean(
    dockState?.visible && dockState?.maximized && dockState?.maximizedView === 'pizarra'
  );
}

export default function PizarraLiveSurfaceLayer({
  elements,
  selectedElementIds,
  activeTerminalId = null,
  onSelect,
  onMoveElement,
  onSurfaceDragStart,
  onSurfaceDragMove,
  onSurfaceDragEnd,
  onActivateTerminal,
  onUpdateElement,
  onRemoveElement,
  // pizarra-renderer-switcher: per-shape renderer update.
  // Called by CanvasTerminal when the user picks a new mode from
  // the <PanelRendererSelect> in the surface header.
  onUpdateRendererMode,
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
  visibleViewIds = [],
  isViewTransitioning = false,
  transitionFromViewId = null,
  suspendDuringCanvasPan = false,
  isSurfaceDragging = false,
  hudRevealed = false,
  // Draggable layout dividers (optional)
  // The parent (PizarraPane) computes them and provides the handler that performs
  // the paired resize when a divider is dragged.
  layoutDividers = [],
  onDividerMouseDown,
  // pizarra-editing-ux Phase 4: right-click on a composite surface —
  // { id, clientX, clientY } — so PizarraPane can open the context menu
  // over the surface (same menu as shapes, with the surface selected).
  onSurfaceContextMenu,
}) {
  const { projectRect, zoom } = useCanvasViewport();
  const pizarraOwnsLiveSurfaces = resolvePizarraOwnsLiveSurfaces(dockState);

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

  // Match workspace split policy: multiple live terminal cards on the pizarra canvas
  // share the Canvas 2D renderer so every sibling stays crisp without WebGL context fights.
  const visibleTerminalPanelCount = surfaceShapes.filter(
    (shape) => shape.type === SHAPE_TYPES.TERMINAL
  ).length;

  const resolvedZoom = zoom > 0 ? zoom : 1;
  const views = workspaceWindows || [];
  const fallbackViewId = activeWorkspaceWindowId || views[0]?.id || null;
  const visibleIdSet = new Set(visibleViewIds);

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
        // pizarra-editing-ux Phase 4: unified z-index space with simple
        // shapes. Stored zIndex (default 0) + 1000 when selected/active so
        // the edited surface floats above its siblings while preserving the
        // established order. Replaces the prior selected→100 / 5 split.
        const zIndex = (shape.zIndex ?? 0) + (selected || isActiveTerminal ? 1000 : 0);

        // pizarra-workspace-switch: hide surfaces that have no resolved layout
        // yet (off-screen placeholder) so the stacked-corner flash never shows.
        if (shape._layoutResolved === false) {
          return null;
        }

        // Pass fallbackViewId so carried browsers without a stored viewId still show
        // on the active window (getSurfaceViewId used to return null for browsers).
        const surfaceViewId = getSurfaceViewId(shape, views, fallbackViewId);
        const isShown = Boolean(
          surfaceViewId
            ? visibleIdSet.size === 0 || visibleIdSet.has(surfaceViewId)
            : visibleIdSet.size === 0
        );
        const surfaceOpacity =
          isShown && isViewTransitioning && surfaceViewId === transitionFromViewId ? 0.88 : 1;

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
            onSurfaceDragStart={onSurfaceDragStart}
            onSurfaceDragMove={onSurfaceDragMove}
            onSurfaceDragEnd={onSurfaceDragEnd}
            onActivateTerminal={onActivateTerminal}
            onUpdateElement={onUpdateElement}
            onRemoveElement={onRemoveElement}
            onUpdateRendererMode={onUpdateRendererMode}
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
            visibleTerminalPanelCount={visibleTerminalPanelCount}
            pizarraOwnsLiveSurfaces={pizarraOwnsLiveSurfaces}
            isShown={isShown}
            surfaceOpacity={surfaceOpacity}
            suspendDuringViewTransition={isViewTransitioning && isShown}
            suspendDuringCanvasPan={suspendDuringCanvasPan}
            isSurfaceDragging={isSurfaceDragging}
            hudRevealed={hudRevealed}
            onSurfaceContextMenu={onSurfaceContextMenu}
          />
        );
      })}

      {/* Draggable layout dividers DISABLED per user feedback.
          The vertical blue "píldora" (pill) bar between live surfaces (terminal <-> browser etc.)
          looked bad, added visual noise, and didn't deliver clear value/function (the between-card
          resize UX wasn't polished or needed yet). Keeping the layoutDividers computation + handler
          in PizarraPane in case we revive it later (e.g. as subtle hover-only grips or only during
          multi-select drag). For now: no rendering, cleaner pizarra canvas. */}
      {/* (layoutDividers rendering removed) */}
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
  onSurfaceDragStart,
  onSurfaceDragMove,
  onSurfaceDragEnd,
  onActivateTerminal,
  onUpdateElement,
  onRemoveElement,
  onUpdateRendererMode,
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
  visibleTerminalPanelCount = 1,
  pizarraOwnsLiveSurfaces = false,
  isShown = true,
  surfaceOpacity = 1,
  suspendDuringViewTransition = false,
  suspendDuringCanvasPan = false,
  isSurfaceDragging = false,
  hudRevealed = false,
  onSurfaceContextMenu,
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
  const dragStartedRef = useRef(false);
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
      // pizarra-editing-ux Phase 4: locked surfaces do not move. The hook
      // (usePizarraSurfaceDrag) already bails on mousedown, but group drag
      // can reach handleMove via a selected sibling — guard here too so a
      // locked member never shifts when a group is dragged.
      if (shapeRef.current?.locked) return;
      const zoom = resolvedZoomRef.current || 1;
      // Capture drag-start position + group membership on the first tick only.
      if (!dragStartBoundsRef.current) {
        dragStartedRef.current = true;
        onSurfaceDragStart?.();
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

      // WebView2 HWND is screen-positioned. ResizeObserver does not fire on
      // left/top-only moves, so push live bounds every drag tick or the child
      // stays frozen while the React chrome slides underneath.
      const syncBrowserHwnd = (sid, entry) => {
        const movedShape = entry?.shape;
        if (!movedShape || movedShape.type !== SHAPE_TYPES.BROWSER) return;
        const el = entry?.el;
        if (!el) return;
        try {
          const shell = el.querySelector?.('[data-testid="browser-viewport-shell"]');
          const rect = (shell || el).getBoundingClientRect();
          if (rect.width <= 10 || rect.height <= 10) return;
          const bounds = {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
          const panelId =
            movedShape.panelId || `browser-${projectId || 'pizarra'}-${workspaceId || sid}`;
          scheduleNativeBrowserResize({ panelId, bounds });
        } catch {
          /* ignore mid-drag measure failures */
        }
      };
      if (group) {
        for (const [sid] of group) {
          syncBrowserHwnd(sid, registryRef.current.get(sid));
        }
      } else {
        syncBrowserHwnd(shapeRef.current?.id, registryRef.current.get(shapeRef.current?.id));
      }

      const canvasDeltaX = deltaX;
      const canvasDeltaY = deltaY;
      const currentShape = shapeRef.current;
      if (currentShape && (canvasDeltaX !== 0 || canvasDeltaY !== 0)) {
        onSurfaceDragMove?.(currentShape.id, {
          x: currentShape.x + dragScreenOffsetRef.current.x / zoom,
          y: currentShape.y + dragScreenOffsetRef.current.y / zoom,
        });
      }
    },
    [onSurfaceDragMove, onSurfaceDragStart, projectId, registryRef, workspaceId]
  );

  const handleDragEnd = useCallback(
    ({ totalDeltaX = 0, totalDeltaY = 0 }) => {
      // pizarra-editing-ux Phase 4: no commit when locked (see handleMove).
      if (shapeRef.current?.locked) {
        dragStartedRef.current = false;
        dragStartBoundsRef.current = null;
        groupDragStartRef.current = null;
        return;
      }
      if (dragStartedRef.current) {
        dragStartedRef.current = false;
        onSurfaceDragEnd?.();
      }
      dragStartBoundsRef.current = null;
      const group = groupDragStartRef.current;
      groupDragStartRef.current = null;
      const moved = [];
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
            moved.push({ sid, shape: siblingShape, entry });
          }
        }
      } else {
        const s = shapeRef.current;
        onMoveElementRef.current?.(s.id, {
          x: s.x + totalDeltaX,
          y: s.y + totalDeltaY,
        });
        const entry = registryRef.current.get(s.id);
        moved.push({ sid: s.id, shape: s, entry });
      }

      // pizarra-browser-drag-immediate-sync: right at mouseup, while the wrapper
      // still has the direct-mutated final screen rect (before any React commit
      // from the onMove above), measure the live DOM rect and push it to the
      // native browser bridge immediately.
      // This makes the "vista adaptada" (the loaded web content) appear at the
      // new position/size with zero delay after releasing the drag — no waiting
      // for state update, re-render, layoutSyncKey change, useEffect, etc.
      // The normal React path will later run the same resize+visible (idempotent).
      // Fixes the "mucho retardo en cargar la vista adaptada" when moving browser
      // surfaces, and reduces chances of the content getting into a bad state
      // that requires new workspace to recover.
      // Tauri GTK overlay only — Electron uses in-DOM <webview>, no IPC bounds thrash.
      const isElectron =
        typeof window !== 'undefined' && window.devhubDesktop?.isElectron === true;
      if (isElectron) return;

      for (const { sid, shape: movedShape, entry } of moved) {
        if (!movedShape || movedShape.type !== SHAPE_TYPES.BROWSER) continue;
        const el = entry?.el;
        if (!el) continue;
        try {
          const shell = el.querySelector?.('[data-testid="browser-viewport-shell"]');
          const rect = (shell || el).getBoundingClientRect();
          const bounds = {
            x: Math.round(Number(rect.left) || 0),
            y: Math.round(Number(rect.top) || 0),
            width: Math.max(1, Math.round(Number(rect.width) || 0)),
            height: Math.max(1, Math.round(Number(rect.height) || 0)),
          };
          // Must match PizarraBrowserSurface nativePanelId (not pizarra-browser-*).
          const panelId =
            movedShape.panelId ||
            `browser-${projectId || 'pizarra'}-pizarra-${movedShape.id || sid}`;
          flushNativeBrowserResize({ panelId, bounds }).catch(() => {});
          setNativeBrowserVisibility({ panelId, visible: true, bounds }).catch(() => {});
        } catch {
          // ignore; the hook's normal sync on next render will handle
        }
      }
    },
    [onMoveElementRef, onSurfaceDragEnd, projectId, registryRef, workspaceId]
  );

  // pizarra-editing-ux Phase 4: right-click on a composite resolves to the
  // surface id + native clientX/Y. The layer lives inside the Radix
  // ContextMenuTrigger, so Radix opens the menu automatically; this handler
  // only records the target surface (for mode/locked/actions) and the
  // world-space anchor (for "Pegar aquí") before the menu renders. Bubble
  // phase: if a terminal's xterm swallows contextmenu, this gracefully
  // no-ops and the terminal keeps its own clipboard menu.
  const handleContextMenu = useCallback(
    (event) => {
      onSurfaceContextMenu?.({
        id: shapeRef.current?.id,
        clientX: event.clientX,
        clientY: event.clientY,
      });
      // Suppress the native browser menu so only Radix opens.
      event.preventDefault();
    },
    [onSurfaceContextMenu]
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
        onContextMenu={handleContextMenu}
        style={{
          position: 'absolute',
          left: bounds.x,
          top: bounds.y,
          width: bounds.width,
          height: bounds.height,
          pointerEvents: isShown ? 'none' : 'none',
          visibility: isShown ? 'visible' : 'hidden',
          opacity: isShown ? surfaceOpacity : 0,
          zIndex,
          transition: suspendDuringViewTransition ? 'opacity 0.18s ease-out' : 'none',
        }}
      >
        <CanvasTerminal
          terminalId={shape.panelId || shape.id}
          shape={shape}
          bounds={localBounds}
          selected={selected}
          zoom={resolvedZoom}
          locked={shape.locked}
          onSelect={handleSelectWithModifier}
          onMove={handleMove}
          onDragEnd={handleDragEnd}
          onResize={(newBounds) => {
            if (shape.locked) return;
            onUpdateElement?.(shape.id, newBounds);
          }}
          onActivatePanel={() => onActivateTerminal?.(shape.id)}
          cwd={shape.cwd}
          initialCommand={shape.initialCommand}
          autoFocus={activeTerminalId === shape.id}
          isActivePanel={activeTerminalId === shape.id}
          requestedRendererMode={shape.requestedRendererMode || 'xterm-webgl'}
          onUpdateRendererMode={(mode) => onUpdateRendererMode?.(shape.id, mode)}
          onClose={() => onRemoveElement?.(shape.id)}
          visibleTerminalPanelCount={visibleTerminalPanelCount}
          pizarraOwnsLiveSurfaces={pizarraOwnsLiveSurfaces}
          suspendDuringViewTransition={suspendDuringViewTransition}
          suspendDuringCanvasPan={suspendDuringCanvasPan}
          skipEnterAnimation={suspendDuringViewTransition}
          isShown={isShown}
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
      onContextMenu={handleContextMenu}
      style={{
        position: 'absolute',
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
        pointerEvents: isShown ? 'none' : 'none',
        visibility: isShown ? 'visible' : 'hidden',
        opacity: isShown ? surfaceOpacity : 0,
        zIndex,
        transition: suspendDuringViewTransition ? 'opacity 0.18s ease-out' : 'none',
      }}
    >
      <PizarraBrowserSurface
        shape={shape}
        bounds={localBounds}
        selected={selected}
        zoom={resolvedZoom}
        locked={shape.locked}
        onSelect={handleSelectWithModifier}
        onMove={handleMove}
        onDragEnd={handleDragEnd}
        onUpdateElement={(id, patch) => {
          if (shape.locked) return;
          onUpdateElement?.(id, patch);
        }}
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
        suspendDuringViewTransition={suspendDuringViewTransition}
        suspendDuringCanvasPan={suspendDuringCanvasPan}
        isSurfaceDragging={isSurfaceDragging}
        hudRevealed={hudRevealed}
        skipEnterAnimation={suspendDuringViewTransition}
        pizarraOwnsLiveSurfaces={pizarraOwnsLiveSurfaces}
      />
    </div>
  );
}
